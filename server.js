const express = require('express');
const cors = require('cors');
const ytDlp = require('yt-dlp-exec');

const app = express();
app.use(express.json());

// Set your Vercel domain here before deploying, or use '*' to test globally
const allowedFrontend = 'https://YOUR_VERCEL_APP_URL.vercel.app';

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin === allowedFrontend || allowedFrontend === '*') {
            callback(null, true);
        } else {
            callback(new Error('CORS policy violation'));
        }
    }
}));

app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        const videoInfo = await ytDlp(url, {
            dumpJson: true,
            noWarnings: true
        });
        res.json({
            title: videoInfo.title,
            thumbnail: videoInfo.thumbnail,
            downloadUrl: videoInfo.url
        });
    } catch (error) {
        res.status(500).json({ error: 'Extraction failed or platform blocked request' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
