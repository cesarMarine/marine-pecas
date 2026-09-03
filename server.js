import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import multer from 'multer';
import dotenv from 'dotenv';

try {
    dotenv.config();
    console.log('✅ .env carregado com sucesso');
} catch (err) {
    console.error('❌ Erro ao carregar .env:', err.message);
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// 🔑 CONFIGURAÇÃO DO SUPABASE
const supabaseUrl = process.env.SUPABASE_URL || 'https://gjshdfnpzmitrerzrxkb.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_secret_wmEOXF-i9w5zjrRr3DYJpQ_F6IApL7U';
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// CONFIGURAÇÃO DO RESEND (E-MAIL)
// ============================================
const resend = new Resend(process.env.RESEND_API_KEY || 're_JEK32jYq_JRQQ5dnpcV2AwDxwCJ2sHcP4');

// ============================================
// CONFIGURAÇÃO DO MULTER (UPLOAD DE IMAGENS)
// ============================================
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG, GIF, WEBP ou SVG.'));
        }
    }
});

// ============================================
// FUNÇÃO PARA ENVIAR E-MAIL
// ============================================
async function enviarEmail(destinatario, assunto, mensagemHTML) {
    if (!destinatario) {
        console.log('⚠️ E-mail não enviado: destinatário vazio');
        return false;
    }

    try {
        const { data, error } = await resend.emails.send({
            from: 'Sistema de Peças <atendimento@marinefishing.com.br>',
            to: [destinatario],
            subject: assunto,
            html: mensagemHTML
        });

        if (error) {
            console.error('❌ Erro Resend:', error);
            return false;
        }

        console.log(`✅ E-mail enviado para ${destinatario}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar e-mail:', error.message);
        return false;
    }
}

// ============================================
// TEMPLATES DE E-MAIL
// ============================================

function templateEmailCliente(cliente_nome, numero_chamado, vendedor_nome, total_itens) {
    return `
<!DOCTYPE html>
<html>
<head><style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a237e; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
    .chamado { font-size: 24px; color: #1a237e; font-weight: bold; }
    .footer { margin-top: 20px; padding: 10px; text-align: center; font-size: 12px; color: #666; }
</style></head>
<body>
    <div class="container">
        <div class="header"><h1>📋 Pedido Recebido</h1></div>
        <div class="content">
            <p>Olá <strong>${cliente_nome}</strong>,</p>
            <p>Seu pedido foi recebido com sucesso!</p>
            <p><strong>Número do Chamado:</strong> <span class="chamado">${numero_chamado}</span></p>
            <p><strong>Vendedor:</strong> ${vendedor_nome}</p>
            <p><strong>Total de itens:</strong> ${total_itens}</p>
            <p>Em breve você receberá o orçamento.</p>
            <hr>
            <p><small>Este é um e-mail automático. Por favor, não responda.</small></p>
        </div>
        <div class="footer"><p>Sistema de Peças - ${new Date().getFullYear()}</p></div>
    </div>
</body>
</html>
    `;
}

function templateEmailVendedor(cliente_nome, cliente_cnpj, numero_chamado, total_itens) {
    return `
<!DOCTYPE html>
<html>
<head><style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #00b894; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
    .chamado { font-size: 24px; color: #00b894; font-weight: bold; }
</style></head>
<body>
    <div class="container">
        <div class="header"><h1>🔔 Novo Pedido</h1></div>
        <div class="content">
            <p>Olá vendedor,</p>
            <p>Um novo pedido foi recebido!</p>
            <p><strong>Cliente:</strong> ${cliente_nome}</p>
            <p><strong>CNPJ:</strong> ${cliente_cnpj}</p>
            <p><strong>Chamado:</strong> <span class="chamado">${numero_chamado}</span></p>
            <p><strong>Total de itens:</strong> ${total_itens}</p>
            <p><a href="${BASE_URL}/pedidos.html" style="background:#1a237e;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">Ver no sistema</a></p>
            <hr>
            <p><small>Este é um e-mail automático. Por favor, não responda.</small></p>
        </div>
        <div class="footer"><p>Sistema de Peças - ${new Date().getFullYear()}</p></div>
    </div>
</body>
</html>
    `;
}

function templateEmailTecnico(cliente_nome, numero_chamado, vendedor_nome) {
    return `
<!DOCTYPE html>
<html>
<head><style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #6c5ce7; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
    .chamado { font-size: 24px; color: #6c5ce7; font-weight: bold; }
</style></head>
<body>
    <div class="container">
        <div class="header"><h1>🔧 Pedido em Análise</h1></div>
        <div class="content">
            <p>Olá técnico,</p>
            <p>Um pedido foi enviado para análise técnica!</p>
            <p><strong>Cliente:</strong> ${cliente_nome}</p>
            <p><strong>Chamado:</strong> <span class="chamado">${numero_chamado}</span></p>
            <p><strong>Vendedor:</strong> ${vendedor_nome}</p>
            <p><a href="${BASE_URL}/tecnico.html" style="background:#6c5ce7;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">Ver no sistema</a></p>
            <hr>
            <p><small>Este é um e-mail automático. Por favor, não responda.</small></p>
        </div>
        <div class="footer"><p>Sistema de Peças - ${new Date().getFullYear()}</p></div>
    </div>
</body>
</html>
    `;
}

function templateEmailOrcamentoCliente(cliente_nome, numero_chamado, valor_total) {
    return `
<!DOCTYPE html>
<html>
<head><style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #00b894; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
    .valor { font-size: 28px; color: #00b894; font-weight: bold; }
</style></head>
<body>
    <div class="container">
        <div class="header"><h1>📊 Orçamento Finalizado</h1></div>
        <div class="content">
            <p>Olá <strong>${cliente_nome}</strong>,</p>
            <p>Seu orçamento está pronto!</p>
            <p><strong>Número do Chamado:</strong> ${numero_chamado}</p>
            <p><strong>Valor Total:</strong> <span class="valor">R$ ${valor_total.toFixed(2)}</span></p>
            <p>Em breve o vendedor entrará em contato com você.</p>
            <hr>
            <p><small>Este é um e-mail automático. Por favor, não responda.</small></p>
        </div>
        <div class="footer"><p>Sistema de Peças - ${new Date().getFullYear()}</p></div>
    </div>
</body>
</html>
    `;
}

function templateEmailOrcamentoVendedor(cliente_nome, numero_chamado, valor_total) {
    return `
<!DOCTYPE html>
<html>
<head><style>
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0984e3; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px; }
</style></head>
<body>
    <div class="container">
        <div class="header"><h1>📊 Orçamento Pronto</h1></div>
        <div class="content">
            <p>Olá vendedor,</p>
            <p>O orçamento do pedido <strong>${numero_chamado}</strong> está pronto!</p>
            <p><strong>Cliente:</strong> ${cliente_nome}</p>
            <p><strong>Valor Total:</strong> R$ ${valor_total.toFixed(2)}</p>
            <p><a href="${BASE_URL}/pedidos.html" style="background:#1a237e;color:white;padding:10px 20px;border-radius:4px;text-decoration:none;">Ver no sistema</a></p>
            <hr>
            <p><small>Este é um e-mail automático. Por favor, não responda.</small></p>
        </div>
        <div class="footer"><p>Sistema de Peças - ${new Date().getFullYear()}</p></div>
    </div>
</body>
</html>
    `;
}

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname));

// ============================================
// ROTAS DE UPLOAD E LISTAGEM DE IMAGENS
// ============================================

app.post('/api/upload-imagem', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext);
        const sanitizedName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${sanitizedName}_${timestamp}${ext}`;

        console.log(`📤 Upload: ${fileName} (${file.size} bytes)`);

        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets?.some(b => b.name === 'icones');

        if (!bucketExists) {
            console.log('📦 Bucket "icones" não encontrado. Criando...');
            await supabase.storage.createBucket('icones', {
                public: true,
                file_size_limit: 5242880
            });
        }

        const { data, error } = await supabase.storage
            .from('icones')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        const { data: urlData } = supabase.storage
            .from('icones')
            .getPublicUrl(fileName);

        res.json({
            success: true,
            fileName: fileName,
            url: urlData.publicUrl,
            message: 'Imagem enviada com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/imagens', async (req, res) => {
    try {
        const { data, error } = await supabase.storage
            .from('icones')
            .list('', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) {
            if (error.message.includes('bucket not found')) {
                return res.json({ success: true, imagens: [] });
            }
            throw error;
        }

        const imagens = data.filter(f => 
            f.name && 
            !f.name.endsWith('/') && 
            /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)
        ).map(f => ({
            name: f.name,
            url: supabase.storage.from('icones').getPublicUrl(f.name).data.publicUrl,
            size: f.metadata?.size || 0,
            created_at: f.created_at
        }));

        res.json({ success: true, imagens });
    } catch (error) {
        console.error('❌ Erro ao listar imagens:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/manuais-lista', async (req, res) => {
    try {
        const { data, error } = await supabase.storage
            .from('esquemas')
            .list('', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) {
            if (error.message.includes('bucket not found')) {
                return res.json({ success: true, manuais: [] });
            }
            throw error;
        }

        const manuais = data.filter(f => 
            f.name && 
            !f.name.endsWith('/') && 
            /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)
        ).map(f => ({
            name: f.name,
            url: supabase.storage.from('esquemas').getPublicUrl(f.name).data.publicUrl,
            nomeManual: f.name.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '').replace(/_/g, ' ')
        }));

        res.json({ success: true, manuais });
    } catch (error) {
        console.error('❌ Erro ao listar manuais:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS DE CONSULTA
// ============================================

app.get('/api/manuais', async (req, res) => {
    try {
        const { data: manuais, error } = await supabase
            .from('manuais')
            .select('*')
            .order('nome_base', { ascending: true });

        if (error) throw error;
        res.json({ success: true, manuais });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/esquemas/:nome', async (req, res) => {
    try {
        const nomeBase = decodeURIComponent(req.params.nome).trim();

        const { data: manual, error: erroManual } = await supabase
            .from('manuais')
            .select('*')
            .eq('nome_base', nomeBase)
            .single();
        if (erroManual || !manual) {
            return res.status(404).json({ success: false, error: 'Manual não encontrado' });
        }

        const { data: pecas, error: erroPecas } = await supabase
            .from('pecas_catalogo')
            .select('*')
            .eq('manual_id', manual.id)
            .order('numero');
        if (erroPecas) throw erroPecas;

        const { data: hotspots, error: erroHotspots } = await supabase
            .from('hotspots')
            .select('*')
            .eq('manual_id', manual.id)
            .order('numero');
        if (erroHotspots) throw erroHotspots;

        const nomeLimpo = nomeBase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_');
        const { data: imagemUrl } = supabase.storage
            .from('esquemas')
            .getPublicUrl(`${nomeLimpo}.jpg`);

        res.json({
            success: true,
            nome: nomeBase,
            imagemUrl: imagemUrl.publicUrl,
            pecas: pecas,
            hotspots: hotspots,
            totalHotspots: hotspots.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/manuais/:nome/hotspots', async (req, res) => {
    try {
        const nomeBase = req.params.nome.replace(/[^a-zA-Z0-9_\- ]/g, '').trim();
        const { hotspots } = req.body;

        const { data: manual, error: erroManual } = await supabase
            .from('manuais')
            .select('id')
            .eq('nome_base', nomeBase)
            .single();
        if (erroManual || !manual) return res.status(404).json({ success: false, error: 'Manual não encontrado' });

        await supabase.from('hotspots').delete().eq('manual_id', manual.id);

        if (hotspots && hotspots.length > 0) {
            const linhas = hotspots.map(h => ({
                manual_id: manual.id,
                numero: h.numero,
                x_percent: h.x_percent,
                y_percent: h.y_percent
            }));
            const { error } = await supabase.from('hotspots').insert(linhas);
            if (error) throw error;
        }

        res.json({ success: true, message: `${hotspots.length} hotspots salvos!` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS DE CONFIGURAÇÃO DE ESTILOS
// ============================================
app.get('/api/config-estilos', async (req, res) => {
    try {
        const { data } = await supabase
            .from('config_estilos')
            .select('*')
            .order('id', { ascending: true })
            .limit(1);
        res.json({ success: true, config: data[0] || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/config-estilos', async (req, res) => {
    try {
        const { tamanho_fonte, cor_pin, cor_fonte, estilo } = req.body;
        const { data, error } = await supabase
            .from('config_estilos')
            .upsert({ id: 1, tamanho_fonte, cor_pin, cor_fonte, estilo }, { onConflict: 'id' });
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS PARA CATÁLOGO
// ============================================

app.get('/api/grupos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('grupos').select('*').order('ordem', { ascending: true });
        if (error) throw error;
        res.json({ success: true, grupos: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/grupos', async (req, res) => {
    try {
        const { nome, icone_url } = req.body;
        const { data, error } = await supabase.from('grupos')
            .insert({ nome, icone_url })
            .select();
        if (error) throw error;
        res.json({ success: true, grupo: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/grupos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('grupos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/subgrupos', async (req, res) => {
    try {
        const { data, error } = await supabase.from('subgrupos').select('*').order('ordem', { ascending: true });
        if (error) throw error;
        res.json({ success: true, subgrupos: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/subgrupos/:grupoId', async (req, res) => {
    try {
        const { data, error } = await supabase.from('subgrupos').select('*').eq('grupo_id', req.params.grupoId).order('ordem', { ascending: true });
        if (error) throw error;
        res.json({ success: true, subgrupos: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/subgrupos', async (req, res) => {
    try {
        const { grupo_id, nome, icone_url } = req.body;
        const { data, error } = await supabase.from('subgrupos')
            .insert({ grupo_id, nome, icone_url })
            .select();
        if (error) throw error;
        res.json({ success: true, subgrupo: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/subgrupos/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('subgrupos').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/produtos', async (req, res) => {
    try {
        const { data: produtos, error } = await supabase
            .from('produtos_catalogo')
            .select('*')
            .order('nome', { ascending: true });

        if (error) throw error;

        for (const produto of produtos) {
            if (produto.possui_variacoes) {
                const { data: variacoes, error: errVar } = await supabase
                    .from('produtos_variacoes')
                    .select('*')
                    .eq('produto_id', produto.id)
                    .order('ordem', { ascending: true });

                if (!errVar) {
                    produto.variacoes = variacoes;
                }
            }
        }

        res.json({ success: true, produtos });
    } catch (error) {
        console.error('❌ Erro ao listar produtos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/produtos/:subgrupoId', async (req, res) => {
    try {
        const subgrupoId = parseInt(req.params.subgrupoId);
        
        const { data: produtos, error } = await supabase
            .from('produtos_catalogo')
            .select('*')
            .eq('subgrupo_id', subgrupoId)
            .order('ordem', { ascending: true });

        if (error) throw error;

        for (const produto of produtos) {
            if (produto.possui_variacoes) {
                const { data: variacoes, error: errVar } = await supabase
                    .from('produtos_variacoes')
                    .select('*')
                    .eq('produto_id', produto.id)
                    .order('ordem', { ascending: true });
                    
                if (!errVar) {
                    produto.variacoes = variacoes;
                }
            }
        }

        res.json({ success: true, produtos });
    } catch (error) {
        console.error('❌ Erro ao listar produtos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/produtos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const { data: produto, error } = await supabase
            .from('produtos_catalogo')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }

        let variacoes = [];
        if (produto.possui_variacoes) {
            const { data: variacoesData, error: errVar } = await supabase
                .from('produtos_variacoes')
                .select('*')
                .eq('produto_id', produto.id)
                .order('ordem', { ascending: true });

            if (!errVar && variacoesData) {
                variacoes = variacoesData;
            }
        }

        res.json({ 
            success: true, 
            produto: {
                id: produto.id,
                subgrupo_id: produto.subgrupo_id,
                nome: produto.nome,
                icone_url: produto.icone_url || '',
                manual_url: produto.manual_url || '',
                possui_variacoes: produto.possui_variacoes || false,
                variacoes: variacoes,
                tipo: produto.tipo || 'produto',
                ordem: produto.ordem || 0
            }
        });

    } catch (error) {
        console.error('❌ Erro ao buscar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/produtos', async (req, res) => {
    try {
        const { subgrupo_id, nome, icone_url, manual_url, possui_variacoes, variacoes } = req.body;

        const { data: produto, error: erroProduto } = await supabase
            .from('produtos_catalogo')
            .insert({
                subgrupo_id,
                nome,
                icone_url,
                manual_url,
                possui_variacoes: possui_variacoes || false
            })
            .select()
            .single();

        if (erroProduto) throw erroProduto;

        if (possui_variacoes && variacoes && variacoes.length > 0) {
            const variacoesInserir = variacoes.map(v => ({
                produto_id: produto.id,
                variacao: v,
                manual_url: manual_url
            }));

            const { error: erroVariacoes } = await supabase
                .from('produtos_variacoes')
                .insert(variacoesInserir);

            if (erroVariacoes) throw erroVariacoes;
        }

        res.json({ success: true, produto });
    } catch (error) {
        console.error('❌ Erro ao criar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/produtos/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { subgrupo_id, nome, icone_url, manual_url, possui_variacoes, variacoes } = req.body;

        const { data: produto, error: erroProduto } = await supabase
            .from('produtos_catalogo')
            .update({
                subgrupo_id,
                nome,
                icone_url,
                manual_url,
                possui_variacoes: possui_variacoes || false
            })
            .eq('id', id)
            .select()
            .single();

        if (erroProduto) throw erroProduto;

        if (possui_variacoes && variacoes && variacoes.length > 0) {
            await supabase
                .from('produtos_variacoes')
                .delete()
                .eq('produto_id', id);

            const variacoesInserir = variacoes.map(v => ({
                produto_id: id,
                variacao: v,
                manual_url: manual_url
            }));

            const { error: erroVariacoes } = await supabase
                .from('produtos_variacoes')
                .insert(variacoesInserir);

            if (erroVariacoes) throw erroVariacoes;
        }

        res.json({ success: true, produto });
    } catch (error) {
        console.error('❌ Erro ao atualizar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/produtos/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('produtos_catalogo')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Produto deletado com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar produto:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS DE PEDIDOS
// ============================================

app.get('/api/pedidos', async (req, res) => {
    try {
        const { status, busca } = req.query;
        
        let query = supabase
            .from('orcamentos')
            .select('*')
            .order('data_pedido', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        if (busca) {
            query = query.or(`cliente_nome.ilike.%${busca}%,numero_chamado.ilike.%${busca}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        const pedidosComVariacao = data.map(pedido => {
            let variacoes = [];
            if (pedido.itens && Array.isArray(pedido.itens)) {
                variacoes = [...new Set(pedido.itens.map(item => item.variacao || 'N/A'))];
            }
            return {
                ...pedido,
                variacoes: variacoes,
                variacoes_display: variacoes.join(', ')
            };
        });

        res.json({ success: true, pedidos: pedidosComVariacao });
    } catch (error) {
        console.error('❌ Erro ao listar pedidos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/pedidos/:id', async (req, res) => {
    try {
        const { data: pedido, error } = await supabase
            .from('orcamentos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;

        if (pedido.itens && Array.isArray(pedido.itens)) {
            pedido.itens = pedido.itens.map(item => ({
                ...item,
                variacao: item.variacao || 'N/A'
            }));
        }

        if (pedido.orcamento && Array.isArray(pedido.orcamento)) {
            pedido.orcamento = pedido.orcamento.map(item => ({
                ...item,
                variacao: item.variacao || 'N/A'
            }));
        }

        let imagemUrl = null;
        if (pedido.manual_nome) {
            const nomeLimpo = pedido.manual_nome
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9]/g, '_');
            
            const { data: urlData } = supabase.storage
                .from('esquemas')
                .getPublicUrl(`${nomeLimpo}.jpg`);
            
            imagemUrl = urlData.publicUrl;
        }

        res.json({ 
            success: true, 
            pedido: {
                ...pedido,
                imagem_url: imagemUrl
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/pedidos', async (req, res) => {
    try {
        const { 
            cliente_nome, 
            cliente_cnpj, 
            cliente_telefone, 
            cliente_email, 
            cliente_endereco,
            vendedor_id, 
            vendedor_nome, 
            manual_nome, 
            observacoes, 
            itens
        } = req.body;

        if (!cliente_nome || !cliente_cnpj || !vendedor_id || !itens || itens.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Dados incompletos. Preencha todos os campos obrigatórios.' 
            });
        }

        const agora = new Date();
        const ano = agora.getFullYear().toString().slice(-2);
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        const random = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const numero_chamado = `CH-${ano}${mes}${dia}-${random}`;

        const total_itens = itens.reduce((sum, i) => sum + (i.qtd || 0), 0);

        const itensComVariacao = itens.map(item => ({
            numero: item.numero,
            nome: item.nome,
            qtd: item.qtd || 1,
            variacao: item.variacao || 'N/A',
            manual_nome: item.manual_nome || manual_nome || 'Produto não identificado'
        }));

        const produtos = [...new Set(itensComVariacao.map(i => `${i.manual_nome} (${i.variacao})`))];

        console.log(`📝 Criando pedido: ${numero_chamado}`);
        console.log(`📦 Produtos: ${produtos.join(', ')}`);

        const { data, error } = await supabase
            .from('orcamentos')
            .insert({
                numero_chamado,
                cliente_nome,
                cliente_cnpj,
                cliente_telefone: cliente_telefone || null,
                cliente_email: cliente_email || null,
                cliente_endereco: cliente_endereco || null,
                vendedor_id,
                vendedor_nome,
                manual_nome: produtos.join(' | '),
                observacoes: observacoes || null,
                itens: itensComVariacao,
                total_itens,
                status: 'AGUARDANDO',
                data_pedido: new Date().toISOString()
            })
            .select();

        if (error) throw error;

        if (cliente_email) {
            const assunto = `📋 Pedido Recebido - ${numero_chamado}`;
            const mensagem = templateEmailCliente(cliente_nome, numero_chamado, vendedor_nome, total_itens);
            await enviarEmail(cliente_email, assunto, mensagem);
        }

        const { data: vendedorData } = await supabase
            .from('vendedores')
            .select('email')
            .eq('id', vendedor_id)
            .single();

        if (vendedorData?.email) {
            const assunto = `🔔 Novo Pedido - ${numero_chamado}`;
            const mensagem = templateEmailVendedor(cliente_nome, cliente_cnpj, numero_chamado, total_itens);
            await enviarEmail(vendedorData.email, assunto, mensagem);
        }

        res.json({ 
            success: true, 
            message: 'Pedido enviado com sucesso!',
            numero_chamado,
            pedido: data[0]
        });
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/pedidos/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const id = req.params.id;

        const updates = { 
            status,
            atualizado_em: new Date().toISOString()
        };

        const dataMap = {
            'EM_ANALISE_TECNICA': 'data_analise_tecnica',
            'ORCAMENTO_FINALIZADO': 'data_orcamento_finalizado',
            'ENVIADO_CLIENTE': 'data_enviado_cliente',
            'FINALIZADO': 'data_finalizado'
        };

        if (dataMap[status]) {
            updates[dataMap[status]] = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('orcamentos')
            .update(updates)
            .eq('id', id)
            .select();

        if (error) throw error;

        if (status === 'EM_ANALISE_TECNICA') {
            const pedido = data[0];
            const assunto = `🔧 Pedido em Análise - ${pedido.numero_chamado}`;
            const mensagem = templateEmailTecnico(
                pedido.cliente_nome,
                pedido.numero_chamado,
                pedido.vendedor_nome || 'Vendedor'
            );
            await enviarEmail('anderson@marinefishing.com.br', assunto, mensagem);
        }

        res.json({ success: true, pedido: data[0] });
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/pedidos/:id/orcamento', async (req, res) => {
    try {
        const id = req.params.id;
        const { orcamento, observacoes_tecnico } = req.body;

        if (!orcamento || orcamento.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Orçamento vazio. Adicione pelo menos um item.' 
            });
        }

        const orcamentoComVariacao = orcamento.map(item => ({
            ...item,
            variacao: item.variacao || 'N/A'
        }));

        const valor_total = orcamentoComVariacao.reduce((sum, item) => {
            return sum + ((parseFloat(item.preco_unitario) || 0) * (parseInt(item.qtd) || 0));
        }, 0);

        console.log(`📊 Salvando orçamento para pedido ${id}: R$ ${valor_total.toFixed(2)}`);

        const { data, error } = await supabase
            .from('orcamentos')
            .update({
                orcamento: orcamentoComVariacao,
                valor_total,
                observacoes_tecnico: observacoes_tecnico || null,
                status: 'ORCAMENTO_FINALIZADO',
                data_orcamento_finalizado: new Date().toISOString(),
                atualizado_em: new Date().toISOString()
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        const pedido = data[0];

        if (pedido.cliente_email) {
            const assunto = `📊 Orçamento Finalizado - ${pedido.numero_chamado}`;
            const mensagem = templateEmailOrcamentoCliente(
                pedido.cliente_nome,
                pedido.numero_chamado,
                valor_total
            );
            await enviarEmail(pedido.cliente_email, assunto, mensagem);
        }

        const { data: vendedorData } = await supabase
            .from('vendedores')
            .select('email')
            .eq('id', pedido.vendedor_id)
            .single();

        if (vendedorData?.email) {
            const assunto = `📊 Orçamento Pronto - ${pedido.numero_chamado}`;
            const mensagem = templateEmailOrcamentoVendedor(
                pedido.cliente_nome,
                pedido.numero_chamado,
                valor_total
            );
            await enviarEmail(vendedorData.email, assunto, mensagem);
        }

        res.json({ success: true, pedido: data[0] });
    } catch (error) {
        console.error('❌ Erro ao salvar orçamento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS DE VENDEDORES
// ============================================
app.get('/api/vendedores', async (req, res) => {
    try {
        const { data, error } = await supabase.from('vendedores').select('*');
        if (error) throw error;
        res.json({ success: true, vendedores: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/vendedores', async (req, res) => {
    try {
        const { nome, codigo, email, telefone } = req.body;
        
        if (!nome) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nome do vendedor é obrigatório' 
            });
        }

        const { data, error } = await supabase
            .from('vendedores')
            .insert({ 
                nome, 
                codigo: codigo || null, 
                email: email || null, 
                telefone: telefone || null 
            })
            .select();

        if (error) {
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({ success: true, vendedor: data[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/vendedores/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('vendedores').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CONSULTAR CNPJ
// ============================================
app.get('/api/consultar-cnpj/:cnpj', async (req, res) => {
    try {
        const cnpj = req.params.cnpj.replace(/\D/g, '');
        
        if (cnpj.length !== 14) {
            return res.status(400).json({ 
                success: false, 
                error: 'CNPJ deve ter 14 dígitos' 
            });
        }

        const url = `https://receitaws.com.br/v1/cnpj/${cnpj}`;
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                error: `Erro na consulta: ${response.status}` 
            });
        }

        const data = await response.json();

        if (data.status === 'ERROR') {
            return res.status(404).json({ 
                success: false, 
                error: data.message || 'CNPJ não encontrado' 
            });
        }

        if (data.nome) {
            return res.json({
                success: true,
                razao_social: data.nome,
                nome_fantasia: data.fantasia || '',
                cep: data.cep || '',
                endereco: data.logradouro || '',
                numero: data.numero || '',
                complemento: data.complemento || '',
                bairro: data.bairro || '',
                cidade: data.municipio || '',
                uf: data.uf || '',
                telefone: data.telefone || '',
                email: data.email || '',
                situacao: data.situacao || ''
            });
        }

        res.status(404).json({ 
            success: false, 
            error: 'CNPJ não encontrado' 
        });

    } catch (error) {
        console.error('❌ Erro ao consultar CNPJ:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// ROTAS DE PREÇOS DE REFERÊNCIA
// ============================================

app.get('/api/precos/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo.trim().toUpperCase();
        
        const { data, error } = await supabase
            .from('precos_referencia')
            .select('*')
            .eq('codigo', codigo)
            .maybeSingle();

        if (error) throw error;
        
        if (data) {
            res.json({ success: true, preco: data });
        } else {
            res.json({ success: false, message: 'Código não encontrado' });
        }
    } catch (error) {
        console.error('❌ Erro ao buscar preço:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/precos', async (req, res) => {
    try {
        const { codigo, descricao, preco, codigo_manual, descricao_manual, compatibilidade, fornecedor } = req.body;

        if (!codigo || preco === undefined) {
            return res.status(400).json({ 
                success: false, 
                error: 'Código e preço são obrigatórios' 
            });
        }

        const codigoUpper = codigo.trim().toUpperCase();

        const { data, error } = await supabase
            .from('precos_referencia')
            .upsert({
                codigo: codigoUpper,
                descricao: descricao || null,
                preco: preco,
                codigo_manual: codigo_manual || null,
                descricao_manual: descricao_manual || null,
                compatibilidade: compatibilidade || null,
                fornecedor: fornecedor || null,
                ultima_atualizacao: new Date().toISOString()
            }, { 
                onConflict: 'codigo',
                ignoreDuplicates: false 
            })
            .select();

        if (error) throw error;
        res.json({ success: true, preco: data[0] });
    } catch (error) {
        console.error('❌ Erro ao salvar preço:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/precos/importar', async (req, res) => {
    try {
        const { precos } = req.body;

        if (!precos || !Array.isArray(precos) || precos.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nenhum dado para importar' 
            });
        }

        const dadosParaInserir = precos.map(item => {
            const codigo = item.codigo ? String(item.codigo).trim().toUpperCase() : null;
            const codigoManual = item.codigo_manual ? String(item.codigo_manual).trim() : null;
            
            return {
                codigo: codigo,
                descricao: item.descricao ? String(item.descricao).trim() : null,
                preco: parseFloat(item.preco) || 0,
                codigo_manual: codigoManual,
                descricao_manual: item.descricao_manual ? String(item.descricao_manual).trim() : null,
                compatibilidade: item.compatibilidade ? String(item.compatibilidade).trim() : null,
                fornecedor: item.fornecedor ? String(item.fornecedor).trim() : null,
                ultima_atualizacao: new Date().toISOString()
            };
        }).filter(item => item.codigo && item.preco > 0);

        if (dadosParaInserir.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nenhum dado válido para importar. Verifique se as colunas estão corretas.' 
            });
        }

        console.log(`📊 Importando ${dadosParaInserir.length} registros...`);

        const { data, error } = await supabase
            .from('precos_referencia')
            .upsert(dadosParaInserir, { 
                onConflict: 'codigo',
                ignoreDuplicates: false 
            })
            .select();

        if (error) throw error;
        
        console.log(`✅ ${data.length} registros importados com sucesso`);
        res.json({ 
            success: true, 
            message: `${data.length} registros importados com sucesso`,
            total: data.length 
        });
    } catch (error) {
        console.error('❌ Erro ao importar preços:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/precos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('precos_referencia')
            .select('*')
            .order('codigo', { ascending: true });

        if (error) throw error;
        res.json({ success: true, precos: data });
    } catch (error) {
        console.error('❌ Erro ao listar preços:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/precos/:codigo', async (req, res) => {
    try {
        const codigo = req.params.codigo.trim().toUpperCase();
        
        const { error } = await supabase
            .from('precos_referencia')
            .delete()
            .eq('codigo', codigo);

        if (error) throw error;
        res.json({ success: true, message: 'Preço removido com sucesso' });
    } catch (error) {
        console.error('❌ Erro ao deletar preço:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CONFIGURAÇÃO GLOBAL DO TÉCNICO
// ============================================

app.get('/api/config-tecnico', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('config_tecnicos')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        res.json({ success: true, config: data });
    } catch (error) {
        console.error('❌ Erro ao buscar config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/config-tecnico', async (req, res) => {
    try {
        const { cambio, coeficiente, senha, atualizado_por } = req.body;

        if (senha !== 'MEUPATO') {
            return res.status(401).json({ 
                success: false, 
                error: 'Senha incorreta' 
            });
        }

        if (!cambio || !coeficiente || cambio <= 0 || coeficiente <= 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Valores inválidos' 
            });
        }

        const { data, error } = await supabase
            .from('config_tecnicos')
            .upsert({
                id: 1,
                cambio: parseFloat(cambio),
                coeficiente: parseFloat(coeficiente),
                atualizado_por: atualizado_por || 'Técnico',
                atualizado_em: new Date().toISOString()
            }, { onConflict: 'id' })
            .select();

        if (error) throw error;
        res.json({ success: true, config: data[0] });
    } catch (error) {
        console.error('❌ Erro ao salvar config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// SERVIDOR DE IMAGENS LOCAL
// ============================================
app.get('/images/*', (req, res) => {
    const imageName = decodeURIComponent(req.params[0]);
    const imagePath = path.join(__dirname, 'esquemas', imageName);

    if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
    } else {
        res.status(404).send('Imagem não encontrada');
    }
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================
try {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Servidor rodando em http://0.0.0.0:${PORT}`);
        console.log(`📦 Projeto: Marine Peças`);
        console.log(`🔗 URL Base: ${BASE_URL}`);
    });
} catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
}

// CAPTURA ERROS NÃO TRATADOS
process.on('uncaughtException', (err) => {
    console.error('❌ Erro não capturado:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promessa rejeitada não tratada:', reason);
    process.exit(1);
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📦 Projeto: Marine Peças`);
    console.log(`🔗 URL Base: ${BASE_URL}`);
});