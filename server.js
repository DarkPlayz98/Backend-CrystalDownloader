const express = require("express");
const cors = require("cors");
const ytDlp = require("yt-dlp-exec");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.post("/api/extract", async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
        return res.status(400).json({
            error: "URL required"
        });
    }

    try {
        const output = await ytDlp(url, {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            preferFreeFormats: true
        });

        // yt-dlp-exec can return stdout as a string
        const videoInfo =
            typeof output === "string"
                ? JSON.parse(output)
                : output;

        if (!videoInfo) {
            throw new Error("No video information returned");
        }

        // Find the best available direct format URL
        let downloadUrl = videoInfo.url || null;

        if (!downloadUrl && Array.isArray(videoInfo.formats)) {
            const format = videoInfo.formats
                .filter(f => f.url)
                .sort((a, b) => {
                    const aHeight = a.height || 0;
                    const bHeight = b.height || 0;
                    return bHeight - aHeight;
                })[0];

            downloadUrl = format?.url || null;
        }

        if (!downloadUrl) {
            return res.status(500).json({
                error: "No downloadable URL found"
            });
        }

        res.json({
            success: true,
            title: videoInfo.title || "Unknown title",
            thumbnail: videoInfo.thumbnail || null,
            downloadUrl
        });

    } catch (error) {
        console.error("yt-dlp error:", error);

        res.status(500).json({
            success: false,
            error: "Extraction failed",
            details: error?.message || String(error)
        });
    }
});

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "yt-dlp API is running"
    });
});

const PORT = Number(process.env.PORT) || 10000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`API running on port ${PORT}`);
});
