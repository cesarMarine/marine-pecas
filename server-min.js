import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.get('/', (req, res) => {
    res.send('✅ Servidor está rodando!');
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'API funcionando!' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});