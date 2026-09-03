// sync_tudo_manuais.js - MESMO do marine-v1, mas com SUPABASE!
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import chokidar from 'chokidar';
import XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = 'https://gjshdfnpzmitrerzrxkb.supabase.co';
const supabaseKey = 'sb_secret_wmEOXF-i9w5zjrRr3DYJpQ_F6IApL7U';
const supabase = createClient(supabaseUrl, supabaseKey);

const PASTA_ESQUEMAS = path.join(__dirname, '..', 'images', 'esquemas');

const CONFIG = {
    COLUNAS: 6,
    LINHAS: 6,
    OVERLAP: 20,
    RESIZE_FACTOR: 2.5,
    CONFIANCA_MINIMA: 25,
    TIMEOUT_OCR: 8000,
    BATCH_SIZE: 2,
    DISTANCIA_AGRUPAMENTO: 1.5,
    ESTRATEGIAS: [
        { name: 'Threshold_120', grayscale: true, threshold: 120 },
        { name: 'Threshold_150', grayscale: true, threshold: 150 },
        { name: 'HighContrast', grayscale: true, linear: [2.5, -120] },
        { name: 'Sharpen', grayscale: true, sharpen: { sigma: 1.5 }, linear: [2.0, -80] },
        { name: 'Negate', grayscale: true, negate: true, linear: [2.0, -50] }
    ]
};

function agruparHotspotsProximos(resultados, distanciaMaxima = 1.5) {
    if (resultados.length === 0) return resultados;
    const sorted = [...resultados].sort((a, b) => b.confianca - a.confianca);
    const grupos = [];
    const usados = new Set();
    for (let i = 0; i < sorted.length; i++) {
        if (usados.has(i)) continue;
        const item = sorted[i];
        const grupo = [item];
        usados.add(i);
        for (let j = i + 1; j < sorted.length; j++) {
            if (usados.has(j)) continue;
            const outro = sorted[j];
            const dx = Math.abs(parseFloat(item.x) - parseFloat(outro.x));
            const dy = Math.abs(parseFloat(item.y) - parseFloat(outro.y));
            const distancia = Math.sqrt(dx * dx + dy * dy);
            if (distancia <= distanciaMaxima) {
                grupo.push(outro);
                usados.add(j);
            }
        }
        grupo.sort((a, b) => b.confianca - a.confianca);
        let melhorItem = grupo[0];
        let melhorNumero = melhorItem.numero;
        for (const item of grupo) {
            if (item.numero.length > melhorNumero.length) {
                const isSubstring = melhorNumero.includes(item.numero) || item.numero.includes(melhorNumero);
                if (isSubstring || item.confianca > melhorItem.confianca * 1.2) {
                    melhorItem = item;
                    melhorNumero = item.numero;
                }
            }
        }
        const mediaX = grupo.reduce((s, item) => s + parseFloat(item.x), 0) / grupo.length;
        const mediaY = grupo.reduce((s, item) => s + parseFloat(item.y), 0) / grupo.length;
        grupos.push({
            ...melhorItem,
            x: mediaX.toFixed(2),
            y: mediaY.toFixed(2),
            confianca: melhorItem.confianca,
            agrupados: grupo.length,
            numerosEncontrados: grupo.map(g => g.numero).join(', ')
        });
    }
    return grupos;
}

async function importarExcel(caminhoExcel) {
    const pecas = [];
    try {
        const workbook = XLSX.readFile(caminhoExcel);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const dados = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const paresColunas = [
            { colNum: 0, colNome: 1 },
            { colNum: 2, colNome: 3 },
            { colNum: 9, colNome: 10 },
            { colNum: 12, colNome: 13 }
        ];
        for (const linha of dados) {
            for (const par of paresColunas) {
                let num = linha[par.colNum];
                let nome = linha[par.colNome];
                if (num !== undefined && nome !== undefined) {
                    num = String(num).trim().replace('.0', '').toUpperCase();
                    nome = String(nome).trim().toUpperCase();
                    if (num && nome && !nome.includes('NOME') && num !== 'N°' && num !== 'N°.1') {
                        pecas.push({ numero: num, nome });
                    }
                }
            }
        }
        return pecas;
    } catch (error) {
        console.error('❌ Erro ao ler Excel:', error.message);
        return pecas;
    }
}

async function processarImagem(caminhoImagem, pecas) {
    const codigosValidos = new Set(pecas.map(p => p.numero));
    console.log(`    📋 ${codigosValidos.size} códigos para buscar`);
    try {
        const imagemBuffer = await sharp(caminhoImagem).toBuffer();
        const metadata = await sharp(imagemBuffer).metadata();
        const imgW = metadata.width;
        const imgH = metadata.height;
        console.log(`    📐 Dimensões: ${imgW}x${imgH}`);
        console.log(`    🧩 Grid: ${CONFIG.COLUNAS}x${CONFIG.LINHAS} = ${CONFIG.COLUNAS * CONFIG.LINHAS} blocos`);
        console.log(`    🔍 ${CONFIG.ESTRATEGIAS.length} estratégias`);
        const resultados = await processarComMultiplasEstrategias(imagemBuffer, imgW, imgH, codigosValidos);
        console.log(`    🔎 ${resultados.length} candidatos brutos`);
        const resultadosAgrupados = agruparHotspotsProximos(resultados, CONFIG.DISTANCIA_AGRUPAMENTO);
        console.log(`    📍 ${resultadosAgrupados.length} candidatos após agrupamento`);
        const pinosUnicos = new Map();
        for (const item of resultadosAgrupados) {
            let numero = item.numero;
            if (codigosValidos.has(numero)) {
                if (!pinosUnicos.has(numero) || item.confianca > pinosUnicos.get(numero).confianca) {
                    pinosUnicos.set(numero, { ...item, numero });
                }
                continue;
            }
            let encontrou = false;
            for (const codigo of codigosValidos) {
                if (codigo.includes(numero) || numero.includes(codigo)) {
                    const melhorNumero = codigo.length >= numero.length ? codigo : numero;
                    if (codigosValidos.has(melhorNumero)) {
                        if (!pinosUnicos.has(melhorNumero) || item.confianca > pinosUnicos.get(melhorNumero).confianca) {
                            pinosUnicos.set(melhorNumero, { ...item, numero: melhorNumero });
                        }
                        encontrou = true;
                        break;
                    }
                }
            }
            if (!encontrou && codigosValidos.has(numero)) {
                if (!pinosUnicos.has(numero) || item.confianca > pinosUnicos.get(numero).confianca) {
                    pinosUnicos.set(numero, { ...item, numero });
                }
            }
        }
        console.log(`    ✅ ${pinosUnicos.size} códigos únicos identificados`);
        return Array.from(pinosUnicos.values());
    } catch (error) {
        console.error('❌ Erro ao processar imagem:', error.message);
        return [];
    }
}

async function processarComMultiplasEstrategias(imagemBuffer, imgW, imgH, codigosValidos) {
    const todosResultados = [];
    const estrategias = CONFIG.ESTRATEGIAS;
    for (let e = 0; e < estrategias.length; e++) {
        const estrategia = estrategias[e];
        process.stdout.write(`      ▶ ${estrategia.name.padEnd(20)}... `);
        try {
            let processado = sharp(imagemBuffer);
            if (estrategia.grayscale) processado = processado.grayscale();
            if (estrategia.negate) processado = processado.negate({ alpha: false });
            if (estrategia.sharpen) processado = processado.sharpen(estrategia.sharpen);
            if (estrategia.linear) processado = processado.linear(estrategia.linear[0], estrategia.linear[1]);
            if (estrategia.threshold) processado = processado.threshold(estrategia.threshold);
            const bufferProcessado = await processado.toBuffer();
            processado = null;
            const blocos = gerarBlocos(imgW, imgH, CONFIG.COLUNAS, CONFIG.LINHAS, CONFIG.OVERLAP);
            const resultadosBlocos = await processarBlocosParalelos(bufferProcessado, blocos, imgW, imgH, CONFIG.RESIZE_FACTOR, codigosValidos);
            todosResultados.push(...resultadosBlocos);
            console.log(`+${resultadosBlocos.length} (total: ${todosResultados.length})`);
        } catch (error) {
            console.log('erro');
        }
    }
    return todosResultados;
}

function gerarBlocos(width, height, cols, rows, overlapPercent) {
    const blocos = [];
    const blocoW = Math.floor(width / cols);
    const blocoH = Math.floor(height / rows);
    const overlapW = Math.floor(blocoW * (overlapPercent / 100));
    const overlapH = Math.floor(blocoH * (overlapPercent / 100));
    for (let c = 0; c < cols; c++) {
        for (let l = 0; l < rows; l++) {
            let left = c * blocoW;
            let top = l * blocoH;
            let w = blocoW;
            let h = blocoH;
            if (c > 0) { left -= overlapW; w += overlapW; }
            if (l > 0) { top -= overlapH; h += overlapH; }
            if (c < cols - 1) w += overlapW;
            if (l < rows - 1) h += overlapH;
            left = Math.max(0, left);
            top = Math.max(0, top);
            w = Math.min(w, width - left);
            h = Math.min(h, height - top);
            if (w >= 10 && h >= 10) {
                blocos.push({ left, top, width: w, height: h, col: c, row: l });
            }
        }
    }
    return blocos;
}

async function processarBlocosParalelos(imagemBuffer, blocos, imgW, imgH, resizeFactor, codigosValidos) {
    const resultados = [];
    const BATCH_SIZE = CONFIG.BATCH_SIZE;
    const totalBlocos = blocos.length;
    for (let i = 0; i < totalBlocos; i += BATCH_SIZE) {
        const lote = blocos.slice(i, i + BATCH_SIZE);
        const promises = lote.map(bloco => processarBloco(imagemBuffer, bloco, imgW, imgH, resizeFactor, codigosValidos));
        const resultadosLote = await Promise.all(promises);
        for (const resultado of resultadosLote) {
            if (resultado && resultado.length > 0) {
                resultados.push(...resultado);
            }
        }
        const atual = Math.min(i + BATCH_SIZE, totalBlocos);
        process.stdout.write(`\r      ${atual}/${totalBlocos} blocos`);
    }
    console.log('');
    return resultados;
}

async function processarBloco(imagemBuffer, bloco, imgW, imgH, resizeFactor, codigosValidos) {
    if (bloco.width < 5 || bloco.height < 5) return [];
    try {
        const bufferBloco = await sharp(imagemBuffer).extract({
            left: Math.round(bloco.left),
            top: Math.round(bloco.top),
            width: Math.round(bloco.width),
            height: Math.round(bloco.height)
        }).resize({
            width: Math.round(bloco.width * resizeFactor),
            height: Math.round(bloco.height * resizeFactor),
            kernel: sharp.kernel.lanczos3
        }).toBuffer();

        const ret = await Promise.race([
            Tesseract.recognize(bufferBloco, 'eng', {
                tessedit_pageseg_mode: '11',
                tessedit_char_whitelist: '0123456789X',
                load_system_dawg: '0',
                load_freq_dawg: '0'
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), CONFIG.TIMEOUT_OCR))
        ]);

        const resultados = [];
        const codigosProcessados = new Set();
        for (const word of ret.data.words) {
            if (word.confidence < CONFIG.CONFIANCA_MINIMA) continue;
            let texto = word.text.trim().toUpperCase();
            texto = texto.replace(/[^0-9X]/g, '');
            texto = texto.replace(/O/g, '0').replace(/Q/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/\|/g, '1').replace(/Z/g, '2').replace(/S/g, '5').replace(/G/g, '6').replace(/B/g, '8').replace(/D/g, '0').replace(/P/g, '9').replace(/R/g, '8');

            if (!codigosValidos.has(texto) && texto.length >= 2) {
                for (let i = 0; i < texto.length; i++) {
                    for (const digito of '0123456789X') {
                        const tentativa = texto.substring(0, i) + digito + texto.substring(i + 1);
                        if (codigosValidos.has(tentativa)) {
                            texto = tentativa;
                            break;
                        }
                    }
                    if (codigosValidos.has(texto)) break;
                }
            }

            if (texto.length > 0 && codigosValidos.has(texto) && !codigosProcessados.has(texto)) {
                codigosProcessados.add(texto);
                const bbox = word.bbox;
                const centroX_resized = (bbox.x0 + bbox.x1) / 2;
                const centroY_resized = (bbox.y0 + bbox.y1) / 2;
                const centroX_orig = centroX_resized / resizeFactor;
                const centroY_orig = centroY_resized / resizeFactor;
                const absX = bloco.left + centroX_orig;
                const absY = bloco.top + centroY_orig;
                const xPercent = (absX / imgW) * 100;
                const yPercent = (absY / imgH) * 100;
                if (xPercent >= 0 && xPercent <= 100 && yPercent >= 0 && yPercent <= 100) {
                    resultados.push({
                        numero: texto,
                        x: xPercent.toFixed(2),
                        y: yPercent.toFixed(2),
                        confianca: word.confidence
                    });
                }
            }
        }
        return resultados;
    } catch (error) {
        return [];
    }
}

async function gravarSupabase(nomeBase, pecas, hotspots) {
    let manual = null;
    const { data: buscaManual } = await supabase
        .from('manuais')
        .select('id')
        .eq('nome_base', nomeBase)
        .single();
    manual = buscaManual;
    if (!manual) {
        const { data: novoManual } = await supabase
            .from('manuais')
            .upsert({ nome_base: nomeBase }, { onConflict: 'nome_base' })
            .select()
            .single();
        manual = novoManual;
    }
    await supabase.from('pecas_catalogo').delete().eq('manual_id', manual.id);
    await supabase.from('hotspots').delete().eq('manual_id', manual.id);
    if (pecas.length > 0) {
        const pecasParaInserir = pecas.map(p => ({
            manual_id: manual.id,
            numero: p.numero,
            nome: p.nome
        }));
        await supabase.from('pecas_catalogo').insert(pecasParaInserir);
    }
    if (hotspots.length > 0) {
        const hotspotsParaInserir = hotspots.map(h => ({
            manual_id: manual.id,
            numero: h.numero,
            x_percent: parseFloat(h.x),
            y_percent: parseFloat(h.y)
        }));
        await supabase.from('hotspots').insert(hotspotsParaInserir);
    }
    const imagemBuffer = fs.readFileSync(path.join(PASTA_ESQUEMAS, `${nomeBase}.jpg`));
    const nomeLimpo = nomeBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
    await supabase.storage.from('esquemas').upload(`${nomeLimpo}.jpg`, imagemBuffer, { upsert: true });
    console.log(`    ✅ ${nomeBase} gravado no Supabase!`);
}

async function processarPar(nomeBase) {
    console.log(`  📦 Processando: ${nomeBase}`);
    const caminhoExcel = path.join(PASTA_ESQUEMAS, `${nomeBase}.xlsx`);
    const caminhoImagem = path.join(PASTA_ESQUEMAS, `${nomeBase}.jpg`);
    if (!fs.existsSync(caminhoExcel)) {
        console.log(`    ⚠️ Excel não encontrado`);
        return false;
    }
    if (!fs.existsSync(caminhoImagem)) {
        console.log(`    ⚠️ Imagem não encontrada`);
        return false;
    }
    try {
        const pecas = await importarExcel(caminhoExcel);
        console.log(`    📋 ${pecas.length} peças encontradas no Excel`);
        const hotspots = await processarImagem(caminhoImagem, pecas);
        console.log(`    📍 ${hotspots.length} hotspots encontrados`);
        await gravarSupabase(nomeBase, pecas, hotspots);
        return true;
    } catch (error) {
        console.error(`    ❌ Erro ao processar ${nomeBase}:`, error.message);
        return false;
    }
}

let watcher = null;
let processando = false;
const filaProcessamento = new Set();

async function iniciarMonitor() {
    console.log('\n🚀 Iniciando Monitor Automático de Manuais');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`📁 Monitorando: ${PASTA_ESQUEMAS}`);
    console.log(`📌 Padrão: nome.xlsx + nome.(jpg|JPG|png|PNG)`);
    console.log('\n');
    const arquivos = fs.readdirSync(PASTA_ESQUEMAS);
    const excels = arquivos.filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    if (excels.length > 0) {
        console.log(`📂 ${excels.length} Excel(s) encontrado(s)`);
        for (const excel of excels) {
            const nomeBase = path.basename(excel, '.xlsx');
            console.log(`  📄 Novo manual: ${nomeBase}`);
            await processarPar(nomeBase);
        }
    }
    watcher = chokidar.watch(PASTA_ESQUEMAS, {
        persistent: true,
        ignoreInitial: true,
        usePolling: true,
        interval: 2000,
        awaitWriteFinish: { stabilityThreshold: 3000, pollInterval: 500 }
    });
    watcher.on('add', async (filePath) => {
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();
        if (ext !== '.xlsx' && !['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return;
        const nomeBase = path.basename(fileName, path.extname(fileName));
        filaProcessamento.add(nomeBase);
        setTimeout(async () => {
            if (filaProcessamento.has(nomeBase) && !processando) {
                filaProcessamento.delete(nomeBase);
                processando = true;
                try {
                    await processarPar(nomeBase);
                } catch (error) {
                    console.error(`❌ Erro: ${error.message}`);
                }
                processando = false;
            }
        }, 3000);
    });
    watcher.on('change', async (filePath) => {
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();
        if (ext === '.xlsx' || ['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
            const nomeBase = path.basename(fileName, path.extname(fileName));
            console.log(`\n📄 Arquivo alterado: ${fileName}`);
            if (!processando) {
                processando = true;
                await processarPar(nomeBase);
                processando = false;
            }
        }
    });
    watcher.on('error', (error) => {
        console.error('⚠️ Erro no watcher:', error.message);
    });
    console.log('\n✅ Monitor ativo! Aguardando novos manuais...');
    console.log('📌 Coloque na pasta:');
    console.log(`   - nome.xlsx (Excel com peças)`);
    console.log(`   - nome.jpg ou nome.JPG (Imagem do esquema)`);
}

async function main() {
    await iniciarMonitor();
}

process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando monitor...');
    if (watcher) watcher.close();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Erro não tratado:', error.message);
});

main().catch(console.error);