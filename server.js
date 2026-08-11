const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

app.post('/api/extract', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    try {
        if (!ytdl.validateURL(url)) {
             return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const info = await ytdl.getInfo(url);
        
        // Use filter to grab a format that has both video and audio
        const format = ytdl.chooseFormat(info.formats, { filter: 'audioandvideo', quality: 'highest' });

        if (!format) {
             return res.status(404).json({ error: 'No downloadable formats found' });
        }

        const thumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;

        res.json({
            title: info.videoDetails.title,
            thumbnail: thumbnail,
            downloadUrl: format.url
        });

    } catch (error) {
        console.error('Extraction Error:', error.message);
        res.status(500).json({ error: 'Failed to extract video data. YouTube may have updated their blocking.' });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
