document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================================================
    // 1. API & HELPER FUNCTIONS (Wiring Logic)
    // =========================================================================

    // Configuration
    const CONFIG = {
        effectId: 'photoToVectorArt',
        model: 'image-effects',
        toolType: 'image-effects',
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        uploadApi: 'https://api.chromastudio.ai/get-emd-upload-url',
        genApi: 'https://api.chromastudio.ai/image-gen',
        downloadProxy: 'https://api.chromastudio.ai/download-proxy',
        cdnDomain: 'https://contents.maxstudio.ai'
    };

    // State
    let currentUploadedUrl = null;

    // --- Utility: Generate NanoID ---
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // --- API: Upload File ---
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension (no media/ prefix)
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL
        const signedUrlResponse = await fetch(
            `${CONFIG.uploadApi}?fileName=${encodeURIComponent(fileName)}`,
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        console.log('Got signed URL');
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = `${CONFIG.cdnDomain}/${fileName}`;
        console.log('Uploaded to:', downloadUrl);
        return downloadUrl;
    }

    // --- API: Submit Job ---
    async function submitImageGenJob(imageUrl) {
        // Image-specific headers
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        const body = {
            model: CONFIG.model,
            toolType: CONFIG.toolType,
            effectId: CONFIG.effectId,
            imageUrl: imageUrl,
            userId: CONFIG.userId,
            removeWatermark: true,
            isPrivate: true
        };

        const response = await fetch(CONFIG.genApi, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        console.log('Job submitted:', data.jobId, 'Status:', data.status);
        return data;
    }

    // --- API: Poll Status ---
    async function pollJobStatus(jobId) {
        const POLL_INTERVAL = 2000; // 2 seconds
        const MAX_POLLS = 60; // Max 2 minutes
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${CONFIG.genApi}/${CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            console.log('Poll', polls + 1, '- Status:', data.status);
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out');
    }

    // --- UI Helpers ---

    const generateBtn = document.getElementById('generate-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultPlaceholder = document.getElementById('result-placeholder');
    const finalResult = document.getElementById('final-result');
    const uploadPrompt = document.getElementById('upload-prompt');
    const previewImg = document.getElementById('preview-image');
    const downloadBtn = document.getElementById('download-btn');

    function showLoading() {
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        if (finalResult) finalResult.classList.add('hidden');
    }

    function hideLoading() {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }

    function updateStatus(text) {
        if (!generateBtn) return;
        
        // Update button text and state based on status
        if (text === 'READY') {
            generateBtn.disabled = false;
            generateBtn.innerHTML = `<span>Generate Vector Art</span><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
        } else {
            generateBtn.disabled = true;
            generateBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                ${text}
            `;
        }
    }

    function showPreview(url) {
        if (previewImg) {
            previewImg.src = url;
            previewImg.classList.remove('hidden');
        }
        if (uploadPrompt) uploadPrompt.classList.add('hidden');
        
        // Reset result area
        if (finalResult) {
            finalResult.classList.add('hidden');
            finalResult.src = '';
            // Remove previous hacks
            finalResult.style.filter = "none";
        }
        if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
        if (downloadBtn) downloadBtn.disabled = true;
    }

    function showResultMedia(url) {
        if (resultPlaceholder) resultPlaceholder.classList.add('hidden');
        
        if (finalResult) {
            finalResult.src = url; // + '?t=' + new Date().getTime(); // Prevent caching
            finalResult.classList.remove('hidden');
            finalResult.style.display = 'block';
        }

        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
        }
    }

    function showError(msg) {
        alert(msg);
    }

    // --- Main Logic: Handle File Selection ---
    async function handleFileSelect(file) {
        if (!file) return;

        try {
            // Show immediate local preview if desired, or wait for upload
            // Using prompt logic: Upload immediately
            updateStatus('Uploading...');
            
            // Reset result state
            if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
            if (finalResult) finalResult.classList.add('hidden');
            if (downloadBtn) downloadBtn.disabled = true;

            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show preview
            showPreview(uploadedUrl);
            updateStatus('READY');
            
        } catch (error) {
            updateStatus('ERROR');
            showError('Upload failed: ' + error.message);
            // Reset UI
            if (uploadPrompt) uploadPrompt.classList.remove('hidden');
            if (previewImg) previewImg.classList.add('hidden');
        }
    }

    // --- Main Logic: Handle Generation ---
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            showError('Please upload an image first.');
            return;
        }
        
        try {
            showLoading();
            updateStatus('Processing...'); // Shows spinner
            
            // 1. Submit Job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            // 2. Poll Status
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                throw new Error('No image URL in response');
            }
            
            // 4. Show Result
            console.log('Result URL:', resultUrl);
            hideLoading();
            showResultMedia(resultUrl);
            updateStatus('READY');
            
        } catch (error) {
            hideLoading();
            updateStatus('Error');
            showError(error.message);
            updateStatus('READY'); // Reset button to allow retry
        }
    }

    // =========================================================================
    // 2. EXISTING UI LOGIC (Particles, Accordion, Menu)
    // =========================================================================

    // --- Hero Particle Animation ---
    const canvas = document.getElementById('hero-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];
        const particleCount = 60;
        const connectionDistance = 150;

        function resize() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        }

        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 3 + 1;
                this.type = Math.random() > 0.5 ? 0 : 1; 
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
            }

            draw() {
                ctx.fillStyle = '#6366f1';
                if (this.type === 0) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
                }
            }
        }

        function initParticles() {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            ctx.lineWidth = 0.5;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < connectionDistance) {
                        const opacity = 1 - (dist / connectionDistance);
                        ctx.strokeStyle = `rgba(99, 102, 241, ${opacity * 0.4})`;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', () => {
            resize();
            initParticles();
        });

        resize();
        initParticles();
        animate();
    }

    // --- FAQ Accordion ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const btn = item.querySelector('.faq-btn');
        const content = item.querySelector('.faq-content');
        
        btn.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                otherItem.querySelector('.faq-content').style.maxHeight = null;
            });
            if (!isActive) {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });

    // --- Mobile Menu Toggle ---
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    function toggleMenu() {
        mobileMenu.classList.toggle('translate-x-full');
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMenu);
        closeMenuBtn.addEventListener('click', toggleMenu);
        mobileLinks.forEach(link => {
            link.addEventListener('click', toggleMenu);
        });
    }

    // =========================================================================
    // 3. PLAYGROUND EVENT WIRING (Connecting UI to API)
    // =========================================================================
    
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const resetBtn = document.getElementById('reset-btn');

    if (dropZone) {
        // Drag Events (Visual Feedback only)
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-over'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-over'), false);
        });

        // Drop Handler -> Trigger Upload
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files[0]) handleFileSelect(files[0]);
        });

        // Click Upload Zone -> Trigger Input
        dropZone.addEventListener('click', () => {
            if (fileInput) fileInput.click();
        });

        // File Input Change -> Trigger Upload
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) handleFileSelect(e.target.files[0]);
            });
        }

        // Generate Button -> Trigger Job
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                if (generateBtn.disabled) return;
                handleGenerate();
            });
        }

        // Reset Button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                currentUploadedUrl = null;
                if (fileInput) fileInput.value = '';
                
                if (previewImg) {
                    previewImg.src = '';
                    previewImg.classList.add('hidden');
                }
                if (uploadPrompt) uploadPrompt.classList.remove('hidden');
                
                if (finalResult) {
                    finalResult.src = '';
                    finalResult.classList.add('hidden');
                }
                if (resultPlaceholder) resultPlaceholder.classList.remove('hidden');
                if (loadingIndicator) loadingIndicator.classList.add('hidden');
                if (downloadBtn) {
                    downloadBtn.disabled = true;
                    downloadBtn.dataset.url = '';
                }
                
                // Reset Generate Button
                generateBtn.disabled = true;
                generateBtn.innerHTML = `<span>Generate Vector Art</span><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
            });
        }

        // Download Button (Robust Implementation)
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const url = downloadBtn.dataset.url;
                if (!url) return;
                
                const originalText = downloadBtn.textContent;
                downloadBtn.textContent = 'Downloading...';
                downloadBtn.disabled = true;
                
                function downloadBlob(blob, filename) {
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = filename;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                }
                
                function getExtension(url, contentType) {
                    if (contentType) {
                        if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
                        if (contentType.includes('png')) return 'png';
                        if (contentType.includes('webp')) return 'webp';
                    }
                    const match = url.match(/\.(jpe?g|png|webp)/i);
                    return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
                }
                
                try {
                    // Strategy 1: Proxy
                    const proxyUrl = `${CONFIG.downloadProxy}?url=${encodeURIComponent(url)}`;
                    const response = await fetch(proxyUrl);
                    if (!response.ok) throw new Error('Proxy failed');
                    
                    const blob = await response.blob();
                    const ext = getExtension(url, response.headers.get('content-type'));
                    downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                    
                } catch (proxyErr) {
                    console.warn('Proxy failed, trying direct:', proxyErr);
                    
                    try {
                        // Strategy 2: Direct Fetch
                        const fetchUrl = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
                        const response = await fetch(fetchUrl, { mode: 'cors' });
                        if (response.ok) {
                            const blob = await response.blob();
                            const ext = getExtension(url, response.headers.get('content-type'));
                            downloadBlob(blob, 'vector_art_' + generateNanoId(8) + '.' + ext);
                            return;
                        }
                    } catch (fetchErr) {
                        console.warn('Direct fetch failed:', fetchErr);
                        alert('Download failed due to browser security. Please right-click the image and select "Save Image As".');
                    }
                } finally {
                    downloadBtn.innerHTML = originalText;
                    downloadBtn.disabled = false;
                }
            });
        }
    }
});