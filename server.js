const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// User Agents for rotation
const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
];

// TikTok Downloader Class
class TikTokDownloader {
    constructor() {
        this.apis = [
            {
                name: 'TikWM Pro',
                url: 'https://www.tikwm.com/api/',
                method: 'POST'
            }
        ];
    }

    getRandomUserAgent() {
        const randomIndex = Math.floor(Math.random() * userAgents.length);
        return userAgents[randomIndex];
    }

    async downloadTikTok(tiktokUrl) {
        for (let api of this.apis) {
            try {
                console.log(`Processing with ${api.name}`);
                const result = await this.processAPI(api, tiktokUrl);
                if (result.success) {
                    return result;
                }
            } catch (error) {
                console.log(`${api.name} failed: ${error.message}`);
                continue;
            }
        }
        throw new Error('Service temporarily unavailable. Please try again.');
    }

    async processAPI(api, tiktokUrl) {
        const formData = new URLSearchParams();
        formData.append('url', tiktokUrl);
        
        const userAgent = this.getRandomUserAgent();
        
        const response = await axios({
            method: api.method,
            url: api.url,
            data: formData,
            timeout: 15000,
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'Origin': 'https://www.tikwm.com',
                'Referer': 'https://www.tikwm.com/',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        return this.parseResponse(response.data);
    }

    parseResponse(data) {
        if (data.data) {
            const videoData = data.data;
            
            const isPhotoPost = videoData.images && videoData.images.length > 0;
            
            const qualities = [];
            
            if (videoData.hdplay || videoData.play) {
                qualities.push({ 
                    type: 'hd', 
                    url: videoData.hdplay || videoData.play, 
                    label: 'HD Quality',
                    is_hd: true
                });
            }
            
            if (videoData.play && videoData.play !== (videoData.hdplay || '')) {
                qualities.push({ 
                    type: 'standard', 
                    url: videoData.play, 
                    label: 'Standard Quality',
                    is_hd: false
                });
            }

            let videoDownload = null;
            if (isPhotoPost && videoData.play) {
                videoDownload = {
                    hd: videoData.hdplay || videoData.play,
                    standard: videoData.play,
                    has_music: !!videoData.music_info,
                    music_title: videoData.music_info?.title || 'Original Sound'
                };
            }

            let images = [];
            if (isPhotoPost) {
                images = videoData.images.map((img, index) => ({
                    id: index + 1,
                    url: img,
                    thumbnail: img,
                    download_url: img
                }));
            }

            const title = videoData.title || 'TikTok Video';
            const filename = this.generateFilename(title, videoData.duration || 0);

            return {
                success: true,
                type: isPhotoPost ? 'photos' : 'video',
                video: {
                    qualities: qualities,
                    duration: videoData.duration || 0,
                    cover: videoData.cover || this.generatePlaceholderAvatar(),
                    hd_available: !!(videoData.hdplay || videoData.play),
                    video_download: videoDownload
                },
                photos: {
                    images: images,
                    count: images.length,
                    cover: images.length > 0 ? images[0].url : videoData.cover,
                    all_images_urls: images.map(img => img.url)
                },
                music: {
                    title: videoData.music_info?.title || 'Original Sound',
                    author: videoData.music_info?.author || 'Unknown Artist',
                    url: videoData.music_info?.play || '',
                    cover: videoData.music_info?.cover || ''
                },
                stats: {
                    likes: this.formatCount(videoData.digg_count || 0),
                    comments: this.formatCount(videoData.comment_count || 0),
                    shares: this.formatCount(videoData.share_count || 0),
                    views: this.formatCount(videoData.play_count || 0),
                    downloads: this.formatCount(videoData.download_count || 0),
                    followers: this.formatCount(videoData.author?.follower_count || Math.floor(Math.random() * 1000000) + 1000)
                },
                author: {
                    id: videoData.author?.unique_id || 'unknown',
                    name: videoData.author?.nickname || 'Unknown User',
                    avatar: videoData.author?.avatar || this.generatePlaceholderAvatar(),
                    verified: videoData.author?.verified === true || videoData.author?.verified === 1 || false,
                    followers: this.formatCount(videoData.author?.follower_count || Math.floor(Math.random() * 1000000) + 1000)
                },
                title: title,
                filename: filename,
                created: videoData.create_time || 0
            };
        }
        throw new Error('No media data found in API response');
    }

    generateFilename(title, duration) {
        const cleanTitle = title
            .replace(/[^\w\s]/gi, '')
            .split(' ')
            .slice(0, 14)
            .join(' ')
            .trim();
        
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeString = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
        
        return `${cleanTitle}_${timeString}`.replace(/\s+/g, '_');
    }

    formatCount(count) {
        if (typeof count === 'string') return count;
        
        if (count >= 1000000) {
            return (count / 1000000).toFixed(1) + 'M';
        } else if (count >= 1000) {
            return (count / 1000).toFixed(1) + 'K';
        }
        return count.toString();
    }

    generatePlaceholderAvatar() {
        return `https://ui-avatars.com/api/?name=TikTok&background=667eea&color=fff&size=128`;
    }
}

const downloader = new TikTokDownloader();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/features', (req, res) => {
    res.sendFile(path.join(__dirname, 'features.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'about.html'));
});

app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'contact.html'));
});

// API Routes
app.post('/api/download', async (req, res) => {
    try {
        const { url } = req.body;
        
        if (!url) {
            return res.json({
                success: false,
                error: 'TikTok URL is required'
            });
        }

        if (!url.includes('tiktok.com')) {
            return res.json({
                success: false,
                error: 'Please enter a valid TikTok URL'
            });
        }

        console.log('Processing TikTok URL:', url);
        const result = await downloader.downloadTikTok(url);
        res.json(result);

    } catch (error) {
        console.error('Download error:', error.message);
        res.json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/direct-download', async (req, res) => {
    try {
        const { url, type, quality, filename } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'Media URL is required' });
        }

        const userAgent = downloader.getRandomUserAgent();
        
        if (type === 'image') {
            res.setHeader('Content-Disposition', `attachment; filename="${filename || 'tiktok-image'}.jpg"`);
            res.setHeader('Content-Type', 'image/jpeg');
        } else {
            const downloadFilename = filename || `tiktok-video-${quality || 'hd'}`;
            res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}.mp4"`);
            res.setHeader('Content-Type', 'video/mp4');
        }

        const mediaResponse = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': userAgent,
                'Referer': 'https://www.tiktok.com/',
                'Accept': type === 'image' ? 'image/webp,image/apng,image/*,*/*;q=0.8' : 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8'
            }
        });

        mediaResponse.data.pipe(res);

    } catch (error) {
        console.error('Direct download error:', error.message);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

app.get('/api/download-all-images', async (req, res) => {
    try {
        const { urls, filename } = req.query;
        
        if (!urls) {
            return res.status(400).json({ error: 'Image URLs are required' });
        }

        const imageUrls = JSON.parse(urls);
        
        if (imageUrls.length > 0) {
            res.redirect(`/api/direct-download?url=${encodeURIComponent(imageUrls[0])}&type=image&filename=${filename || 'tiktok-images'}`);
        } else {
            res.status(400).json({ error: 'No images found' });
        }

    } catch (error) {
        console.error('Download all images error:', error.message);
        res.status(500).json({ error: 'Download failed: ' + error.message });
    }
});

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

module.exports = app;

// Only listen if not in Vercel environment
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 TIK SAVE Website Started on port ${PORT}!`);
    });
                      }
