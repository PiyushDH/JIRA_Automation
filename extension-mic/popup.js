class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
    
    this.micButton = document.getElementById('micButton');
    this.status = document.getElementById('status');
    this.transcriptionDiv = document.getElementById('transcription');
    
    this.init();
  }
  
  init() {
    this.micButton.addEventListener('click', () => {
      if (this.isRecording) {
        this.stopRecording();
      } else {
        this.startRecording();
      }
    });
  }
  
  async startRecording() {
    try {
      this.status.textContent = 'Requesting microphone access...';
      
      // Check if microphone is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone API not supported in this browser');
      }
      
      // Check current permission status
      try {
        const permission = await navigator.permissions.query({name: 'microphone'});
        console.log('Microphone permission status:', permission.state);
        
        if (permission.state === 'denied') {
          throw new Error('Microphone access permanently denied. Please reset permissions in Chrome settings.');
        }
      } catch (permError) {
        console.log('Permission query not supported:', permError);
      }
      
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      
      this.audioChunks = [];
      
      // Try different MIME types for better compatibility
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/wav';
      }
      
      console.log('Using MIME type:', mimeType);
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = () => {
        this.processRecording();
      };
      
      this.mediaRecorder.start();
      this.isRecording = true;
      
      this.micButton.classList.add('recording');
      this.status.textContent = 'Recording... Click to stop';
      this.transcriptionDiv.style.display = 'none';
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      
      let errorMessage = 'Could not access microphone';
      let helpText = '';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied';
        helpText = 'Go to chrome://extensions/ → find this extension → Details → Site settings → Microphone → Allow';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found';
        helpText = 'Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone already in use';
        helpText = 'Close other applications using the microphone and try again.';
      } else if (error.message.includes('permanently denied')) {
        errorMessage = 'Permissions blocked';
        helpText = 'Go to Chrome Settings → Privacy → Microphone → Reset permissions for this extension.';
      } else {
        helpText = error.message;
      }
      
      this.status.textContent = `Error: ${errorMessage}`;
      this.showError(helpText);
    }
  }
  
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      this.micButton.classList.remove('recording');
      this.status.innerHTML = '<div class="loading"></div> Processing audio...';
      
      // Stop all tracks to release microphone
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }
    }
  }
  
  async processRecording() {
    try {
      // Use the MIME type that was actually recorded
      const mimeType = this.mediaRecorder ? this.mediaRecorder.mimeType : 'audio/webm';
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      
      this.status.innerHTML = '<div class="loading"></div> Converting audio...';
      
      // Convert to a supported format (WAV)
      const wavBlob = await this.convertToWav(audioBlob);
      
      this.status.innerHTML = '<div class="loading"></div> Uploading to FAL.AI storage...';
      
      // Upload to fal.ai storage and get URL
      const audioUrl = await this.uploadAudioFile(wavBlob);
      
      this.status.innerHTML = '<div class="loading"></div> Submitting for transcription...';
      
      // Send to fal.ai for transcription
      console.log('Starting transcription with URL:', audioUrl);
      const transcriptionResult = await this.transcribeAudio(audioUrl);
      console.log('Transcription completed:', transcriptionResult);
      
      // Send to mock n8n API
      await this.sendToN8n(transcriptionResult.text);
      
      this.displayTranscription(transcriptionResult);
      
    } catch (error) {
      console.error('Error processing recording:', error);
      this.showError('Failed to process recording: ' + error.message);
    }
  }
  
  async convertToWav(webmBlob) {
    try {
      // Create audio context for conversion
      const audioContext = new AudioContext();
      const arrayBuffer = await webmBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to WAV format
      const wavArrayBuffer = this.audioBufferToWav(audioBuffer);
      return new Blob([wavArrayBuffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('Audio conversion error:', error);
      // Fallback: return original blob
      return webmBlob;
    }
  }
  
  audioBufferToWav(buffer) {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = buffer.getChannelData(channel)[i];
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  }
  
  async uploadAudioFile(audioBlob) {
    try {
      // Get API key from storage
      const result = await chrome.storage.sync.get(['falApiKey']);
      const apiKey = result.falApiKey;
      
      if (!apiKey) {
        throw new Error('FAL API key not found');
      }
      
      // Configure fal client
      fal.config({ credentials: apiKey });
      
      // Create a File object from the blob with proper naming and type
      const timestamp = Date.now();
      const audioFile = new File([audioBlob], `recording_${timestamp}.wav`, { type: 'audio/wav' });
      
      // Upload using fal.ai client (two-step process)
      console.log('Starting FAL.AI storage upload...');
      const audioUrl = await fal.storage.upload(audioFile);
      
      console.log('Audio uploaded successfully to FAL.AI storage:', audioUrl);
      return audioUrl;
      
    } catch (error) {
      console.error('Upload error:', error);
      // Fallback to base64 if upload fails
      console.log('Falling back to base64...');
      return await this.blobToBase64(audioBlob);
    }
  }
  
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Remove the data:audio/webm;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(`data:audio/wav;base64,${base64}`);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  
  async transcribeAudio(audioUrl) {
    try {
      // Get API key from storage
      const result = await chrome.storage.sync.get(['falApiKey']);
      const apiKey = result.falApiKey;
      
      if (!apiKey) {
        throw new Error('FAL API key not found. Please set it in extension options.');
      }
      
      // Configure fal client
      fal.config({ credentials: apiKey });
      
      this.status.innerHTML = '<div class="loading"></div> Submitting to Whisper API...';
      
      console.log('Submitting audio URL to FAL.AI Whisper:', audioUrl);
      
      // Use fal.ai client subscribe method
      const transcriptionResult = await fal.subscribe("fal-ai/wizper", {
        input: {
          audio_url: audioUrl,
          task: 'transcribe',
          language: 'en',
          chunk_level: 'segment',
          version: '3'
        },
        onQueueUpdate: (update) => {
          console.log('Queue update:', update);
          if (update.status === 'IN_PROGRESS') {
            this.status.innerHTML = `<div class="loading"></div> Transcribing... (${update.attempt}/${update.maxAttempts})`;
          }
        }
      });
      
      console.log('Transcription result:', transcriptionResult);
      
      // Handle different possible response structures
      let resultData = transcriptionResult.data || transcriptionResult;
      
      return {
        text: resultData.text || resultData.transcription || 'No transcription available',
        chunks: resultData.chunks || resultData.segments || []
      };
      
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }
  

  
  async sendToN8n(transcription) {
    try {
      console.log('Sending transcription to n8n via background script...');
      
      // Send request through background script to avoid CORS issues
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'sendToN8n',
          transcription: transcription
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      });
      
      console.log('Successfully sent to n8n webhook:', response.message);
      // Show success message briefly
      this.status.innerHTML = '<div style="color: #4CAF50;">✓ Sent to n8n successfully</div>';
      setTimeout(() => {
        this.status.textContent = 'Click to start recording';
      }, 2000);
    } catch (error) {
      console.error('Error sending to n8n:', error);
      // Show error to user but don't break the flow
      this.showError(`Failed to send to n8n: ${error.message}`);
    }
  }
  
  displayTranscription(result) {
    console.log('Displaying transcription:', result);
    
    this.status.textContent = 'Transcription complete';
    this.transcriptionDiv.style.display = 'block';
    
    // Clear previous content
    this.transcriptionDiv.innerHTML = '';
    
    // Handle case where result might be an error or unexpected format
    if (!result || typeof result !== 'object') {
      this.transcriptionDiv.innerHTML = '<div class="error">Invalid transcription result</div>';
      return;
    }
    
    // Extract text - handle different possible response structures
    let transcriptionText = result.text || result.transcription || 'No transcription available';
    
    // If result contains an error, show it
    if (result.error || result.message) {
      this.transcriptionDiv.innerHTML = `<div class="error">Error: ${result.error || result.message}</div>`;
      return;
    }
    
    // Display main transcription text
    const mainText = document.createElement('div');
    mainText.className = 'transcription-main';
    mainText.style.cssText = `
      margin-bottom: 15px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      font-weight: 500;
      line-height: 1.5;
    `;
    mainText.textContent = transcriptionText;
    this.transcriptionDiv.appendChild(mainText);
    
    // Display chunks if available
    if (result.chunks && result.chunks.length > 0) {
      const chunksHeader = document.createElement('div');
      chunksHeader.style.cssText = `
        font-size: 11px;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 8px;
        font-weight: 600;
      `;
      chunksHeader.textContent = 'Timestamped Segments:';
      this.transcriptionDiv.appendChild(chunksHeader);
      
      const chunksContainer = document.createElement('div');
      chunksContainer.className = 'transcription-chunks';
      chunksContainer.style.cssText = `
        max-height: 120px;
        overflow-y: auto;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.1);
      `;
      
      result.chunks.forEach((chunk, index) => {
        const chunkDiv = document.createElement('div');
        chunkDiv.style.cssText = `
          padding: 6px 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 11px;
          line-height: 1.3;
        `;
        
        const timestamp = chunk.timestamp ? 
          `[${this.formatTimestamp(chunk.timestamp[0])} - ${this.formatTimestamp(chunk.timestamp[1])}]` : 
          `[Segment ${index + 1}]`;
        
        chunkDiv.innerHTML = `
          <div style="color: rgba(255, 255, 255, 0.7); margin-bottom: 2px;">${timestamp}</div>
          <div>${chunk.text}</div>
        `;
        
        chunksContainer.appendChild(chunkDiv);
      });
      
      this.transcriptionDiv.appendChild(chunksContainer);
    }
    
    // Reset button state
    setTimeout(() => {
      this.status.textContent = 'Click to start recording';
    }, 2000);
  }
  
  formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  showError(message) {
    this.status.innerHTML = `<div class="error">${message}</div>`;
    
    // Add a permissions button if it's a permission issue
    if (message.includes('chrome://extensions') || message.includes('Settings')) {
      const helpButton = document.createElement('button');
      helpButton.textContent = 'Open Extensions Page';
      helpButton.style.cssText = `
        margin-top: 10px;
        padding: 6px 12px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 11px;
      `;
      
      helpButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'chrome://extensions/' });
      });
      
      const container = document.querySelector('.container');
      container.appendChild(helpButton);
      
      setTimeout(() => {
        if (helpButton.parentNode) {
          helpButton.remove();
        }
      }, 5000);
    }
    
    // Reset button state
    setTimeout(() => {
      this.status.textContent = 'Click to start recording';
      this.micButton.classList.remove('recording');
    }, 5000);
  }
  
  async checkPermissions() {
    try {
      const permission = await navigator.permissions.query({name: 'microphone'});
      let statusText = '';
      
      switch(permission.state) {
        case 'granted':
          statusText = 'Microphone permission: ✅ Granted';
          break;
        case 'denied':
          statusText = 'Microphone permission: ❌ Denied - Reset in Chrome settings';
          break;
        case 'prompt':
          statusText = 'Microphone permission: ⚠️ Will prompt when recording';
          break;
      }
      
      this.status.innerHTML = statusText;
      
      setTimeout(() => {
        this.status.textContent = 'Click to start recording';
      }, 3000);
      
    } catch (error) {
      console.log('Permission check failed:', error);
      this.status.textContent = 'Permission check not supported';
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AudioRecorder();
});

// Add settings button functionality
document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.container');
  
  // Add API Key settings button if not set
  chrome.storage.sync.get(['falApiKey'], (result) => {
    if (!result.falApiKey) {
      const apiKeyBtn = document.createElement('button');
      apiKeyBtn.textContent = 'Set FAL.AI API Key';
      apiKeyBtn.style.cssText = `
        margin-top: 10px;
        padding: 8px 16px;
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 12px;
        margin-right: 5px;
      `;
      
      apiKeyBtn.addEventListener('click', () => {
        const apiKey = prompt('Enter your FAL.AI API Key:');
        if (apiKey) {
          chrome.storage.sync.set({ falApiKey: apiKey }, () => {
            alert('API Key saved successfully!');
            apiKeyBtn.remove();
          });
        }
      });
      
      container.appendChild(apiKeyBtn);
    }
  });
  
  // Add Webhook URL settings button
  chrome.storage.sync.get(['n8nWebhookUrl'], (result) => {
    const webhookBtn = document.createElement('button');
    webhookBtn.textContent = result.n8nWebhookUrl ? 'Change Webhook URL' : 'Set Webhook URL';
    webhookBtn.style.cssText = `
      margin-top: 10px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 12px;
      margin-left: 5px;
    `;
    
    webhookBtn.addEventListener('click', () => {
      const currentUrl = result.n8nWebhookUrl || 'https://masterskywalker.app.n8n.cloud/webhook-test/n8n-JIRA';
      const webhookUrl = prompt('Enter your n8n webhook URL:', currentUrl);
      if (webhookUrl) {
        chrome.storage.sync.set({ n8nWebhookUrl: webhookUrl }, () => {
          alert('Webhook URL saved successfully!');
          webhookBtn.textContent = 'Change Webhook URL';
        });
      }
    });
    
    container.appendChild(webhookBtn);
  });
  
  // Add microphone test button for initial permission request
  const micTestBtn = document.createElement('button');
  micTestBtn.textContent = 'Test Microphone Access';
  micTestBtn.style.cssText = `
    margin-top: 5px;
    padding: 6px 12px;
    background: rgba(255,255,255,0.15);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 4px;
    color: white;
    cursor: pointer;
    font-size: 11px;
  `;
  
  micTestBtn.addEventListener('click', async () => {
    try {
      micTestBtn.textContent = 'Testing...';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTestBtn.textContent = '✅ Microphone OK';
      micTestBtn.style.background = 'rgba(76, 175, 80, 0.3)';
      stream.getTracks().forEach(track => track.stop());
      
      setTimeout(() => {
        micTestBtn.remove();
      }, 2000);
    } catch (error) {
      micTestBtn.textContent = '❌ Access Denied';
      micTestBtn.style.background = 'rgba(244, 67, 54, 0.3)';
      
      setTimeout(() => {
        micTestBtn.textContent = 'Test Microphone Access';
        micTestBtn.style.background = 'rgba(255,255,255,0.15)';
      }, 3000);
    }
  });
  
  container.appendChild(micTestBtn);
}); 