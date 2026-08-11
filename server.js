const express = require('express');
const cors = require('cors');
const path = require('path');
const ytdl = require('@distube/ytdl-core');

const app = express();
app.use(express.json());

// Serve static frontend files (index.html, assets)
app.use(express.static(__dirname));

// Enable full CORS for Vercel and third-party frontends
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Express preflight
app.options('*', cors());

// Platform helper
function detectPlatform(url) {
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    if (/instagram\.com/i.test(url)) return 'instagram';
    if (/facebook\.com|fb\.watch|fb\.com/i.test(url)) return 'facebook';
    if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
    if (/pinterest\.com|pin\.it/i.test(url)) return 'pinterest';
    if (/reddit\.com/i.test(url)) return 'reddit';
    return 'generic';
}

function getYouTubeId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
}

// Universal Cobalt API Extractor (Supports TikTok, IG, FB, YT, Twitter, Reddit, etc.)
async function extractWithCobalt(url) {
    const cobaltInstances = [
        'https://api.cobalt.tools',
        'https://cobalt.api.sc7.io'
    ];

    for (const instance of cobaltInstances) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);
            const resp = await fetch(instance, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (resp.ok) {
                const data = await resp.json();
                const downloadUrl = data.url || (data.picker && data.picker[0]?.url);
                if (downloadUrl || data.picker) {
                    return {
                        title: data.filename || 'Media Content',
                        downloadUrl: downloadUrl || data.picker[0]?.url,
                        picker: data.picker || null,
                        method: 'cobalt'
                    };
                }
            }
        } catch (e) {
            console.warn(`Cobalt instance ${instance} error:`, e.message);
        }
    }
    return null;
}

// TikTok TikWm API Extractor
async function extractTikTok(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (resp.ok) {
            const result = await resp.json();
            if (result.code === 0 && result.data) {
                const data = result.data;
                return {
                    platform: 'tiktok',
                    title: data.title || `TikTok by @${data.author?.unique_id || 'user'}`,
                    thumbnail: data.cover || data.origin_cover,
                    downloadUrl: data.play || data.wmplay,
                    author: data.author?.nickname || data.author?.unique_id,
                    music: data.music_info?.play,
                    method: 'tikwm'
                };
            }
        }
    } catch (e) {
        console.warn('TikWm API failed:', e.message);
    }
    return null;
}

// Main Extraction Endpoint (Supports both GET and POST for easy Vercel frontend integrations)
const handleExtract = async (req, res) => {
    const url = req.body?.url || req.query?.url;
    if (!url) {
        return res.status(400).json({ error: 'URL is required in query (?url=...) or JSON body ({ "url": "..." })' });
    }

    const platform = detectPlatform(url);

    // 1. TIKTOK SPECIFIC LOGIC
    if (platform === 'tiktok') {
        const tikwmData = await extractTikTok(url);
        if (tikwmData) return res.json(tikwmData);

        const cobaltData = await extractWithCobalt(url);
        if (cobaltData) {
            return res.json({
                platform: 'tiktok',
                title: cobaltData.title || 'TikTok Video',
                thumbnail: 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=500&q=80',
                downloadUrl: cobaltData.downloadUrl,
                picker: cobaltData.picker,
                method: 'cobalt'
            });
        }
    }

    // 2. INSTAGRAM SPECIFIC LOGIC
    if (platform === 'instagram') {
        const cobaltData = await extractWithCobalt(url);
        if (cobaltData) {
            return res.json({
                platform: 'instagram',
                title: cobaltData.title || 'Instagram Post/Reel',
                thumbnail: 'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=500&q=80',
                downloadUrl: cobaltData.downloadUrl,
                picker: cobaltData.picker,
                method: 'cobalt'
            });
        }
    }

    // 3. FACEBOOK SPECIFIC LOGIC
    if (platform === 'facebook') {
        const cobaltData = await extractWithCobalt(url);
        if (cobaltData) {
            return res.json({
                platform: 'facebook',
                title: cobaltData.title || 'Facebook Video',
                thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500&q=80',
                downloadUrl: cobaltData.downloadUrl,
                method: 'cobalt'
            });
        }
    }

    // 4. YOUTUBE SPECIFIC LOGIC
    if (platform === 'youtube') {
        const videoId = getYouTubeId(url);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
        }
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Try Cobalt
        const cobaltData = await extractWithCobalt(cleanUrl);
        if (cobaltData && cobaltData.downloadUrl) {
            let title = `YouTube Video (${videoId})`;
            let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            try {
                const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(cleanUrl)}&format=json`);
                if (oembedResp.ok) {
                    const oembed = await oembedResp.json();
                    if (oembed.title) title = oembed.title;
                    if (oembed.thumbnail_url) thumbnail = oembed.thumbnail_url;
                }
            } catch (_) {}

            return res.json({
                platform: 'youtube',
                title,
                thumbnail,
                downloadUrl: cobaltData.downloadUrl,
                method: 'cobalt'
            });
        }

        // Try Piped
        const pipedInstances = ['https://pipedapi.kavin.rocks', 'https://api.piped.private.coffee', 'https://pipedapi.mha.fi'];
        for (const instance of pipedInstances) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const resp = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal });
                clearTimeout(timeout);
                if (resp.ok) {
                    const data = await resp.json();
                    const stream = data.videoStreams?.find(s => !s.videoOnly && s.url) || data.audioStreams?.[0];
                    if (stream && stream.url) {
                        return res.json({
                            platform: 'youtube',
                            title: data.title || `YouTube Video (${videoId})`,
                            thumbnail: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                            downloadUrl: stream.url,
                            method: 'piped'
                        });
                    }
                }
            } catch (_) {}
        }

        // Try Invidious
        const invidiousInstances = ['https://invidious.nerdvpn.de', 'https://inv.riverside.rocks', 'https://invidious.drgns.space'];
        for (const instance of invidiousInstances) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const resp = await fetch(`${instance}/api/v1/videos/${videoId}`, { signal: controller.signal });
                clearTimeout(timeout);
                if (resp.ok) {
                    const data = await resp.json();
                    const stream = data.formatStreams?.find(s => s.url) || data.adaptiveFormats?.find(s => s.url);
                    if (stream && stream.url) {
                        return res.json({
                            platform: 'youtube',
                            title: data.title || `YouTube Video (${videoId})`,
                            thumbnail: data.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                            downloadUrl: stream.url,
                            method: 'invidious'
                        });
                    }
                }
            } catch (_) {}
        }

        // Try ytdl-core
        try {
            const info = await ytdl.getInfo(cleanUrl, {
                playerClients: ['IOS', 'ANDROID', 'TVHTML5', 'WEB_EMBEDDED'],
                requestOptions: {
                    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' }
                }
            });
            const format = ytdl.chooseFormat(info.formats, { filter: 'audioandvideo', quality: 'highest' }) 
                || info.formats.find(f => f.hasVideo && f.hasAudio);
            if (format && format.url) {
                return res.json({
                    platform: 'youtube',
                    title: info.videoDetails.title,
                    thumbnail: info.videoDetails.thumbnails?.[info.videoDetails.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    downloadUrl: format.url,
                    method: 'ytdl-core'
                });
            }
        } catch (_) {}
    }

    // 5. UNIVERSAL / GENERIC EXTRACTION (Cobalt for Twitter, Pinterest, Reddit, etc.)
    const universalData = await extractWithCobalt(url);
    if (universalData) {
        return res.json({
            platform,
            title: universalData.title || `${platform.toUpperCase()} Media`,
            thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=500&q=80',
            downloadUrl: universalData.downloadUrl,
            picker: universalData.picker,
            method: 'cobalt'
        });
    }

    return res.status(500).json({
        error: `Unable to extract media from ${platform.toUpperCase()} at this time. Please check the URL or try again later.`
    });
};

app.post('/api/extract', handleExtract);
app.get('/api/extract', handleExtract);

// Serve frontend index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`API running on port ${PORT}`));


