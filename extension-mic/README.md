# Audio Transcription Chrome Extension

A Chrome extension that allows you to record audio with a click of a button and automatically transcribe it using the fal.ai Whisper API.

## Features

- 🎤 One-click audio recording with visual feedback
- 🔊 High-quality audio capture with noise suppression
- 📝 Automatic transcription using fal.ai Whisper API
- 🔗 Integration with n8n webhook for further processing
- 💾 Secure API key storage in browser
- 🎨 Beautiful and intuitive user interface

## Installation

### 1. Download the Extension

Clone or download this repository to your local machine:

```bash
git clone <repository-url>
cd extension-mic
```

### 2. Install Dependencies (Optional)

If you want to rebuild the fal.ai client:

```bash
npm install
```

The extension includes a pre-built `fal-client.js` file, so this step is optional.

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the extension directory
4. The Audio Transcription Extension should now appear in your extensions
5. Go to chrome://extensions/ → find this extension → Details → Site settings → Microphone → Allow


### 4. Setup API Key

1. Get your FAL.AI API key from [https://fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. Click on the extension icon in Chrome
3. Click "Set FAL.AI API Key" button in the popup
4. Enter your FAL.AI API key when prompted

### 5. Configure n8n Webhook (Optional)

1. Click on the extension icon in Chrome
2. Click "Set Webhook URL" button in the popup
3. Enter your n8n webhook URL (e.g., `https://masterskywalker.app.n8n.cloud/webhook-test/n8n-JIRA`)
4. The extension will now send transcriptions to your n8n workflow

## Usage

### Recording Audio

1. Click the extension icon in Chrome toolbar
2. Click the microphone button to start recording
3. The button will turn red and pulse to indicate recording is active
4. Speak into your microphone
5. Click the microphone button again to stop recording

### Transcription Process

1. After stopping the recording, the extension will:
   - Convert the audio to base64 format
   - Send it to fal.ai Whisper API for transcription
   - Display the transcribed text in the popup
   - Send the transcription to a mock n8n webhook (configurable)

### Viewing Results

- The transcribed text appears in the popup window
- Previous transcriptions are stored locally in the browser
- Any errors will be displayed with helpful error messages

## Configuration

### Environment Variables

Copy `env-example.txt` to `.env` and configure:

```env
# FAL.AI API Configuration
FAL_KEY=your-actual-fal-api-key

# N8N Webhook Configuration  
N8N_WEBHOOK_URL=https://your-n8n-instance.app/webhook/audio-transcription
```

## Troubleshooting

### CORS Issues with n8n Webhook

If you encounter CORS errors when sending to your n8n webhook:

1. **Check n8n Webhook Configuration**: Ensure your n8n webhook is configured to accept POST requests
2. **Verify URL**: Make sure the webhook URL is correct and accessible
3. **Background Script**: The extension uses a background script to bypass CORS restrictions
4. **Check Console**: Open Chrome DevTools (F12) and check the Console tab for detailed error messages

### Common Issues

- **Microphone Access Denied**: Reset microphone permissions in Chrome settings
- **API Key Not Found**: Set your FAL.AI API key using the extension popup
- **Webhook Not Receiving Data**: Check the webhook URL configuration and n8n workflow status
- **Transcription Fails**: Verify your FAL.AI API key is valid and has sufficient credits

### API Integration

#### FAL.AI Whisper API

The extension uses the fal.ai Whisper Queue API with these features:
- **Endpoint**: `https://queue.fal.run/fal-ai/wizper`
- **Model**: `fal-ai/wizper`
- **Task**: `transcribe`
- **Language**: `en` (English)
- **Chunk Level**: `segment`
- **Version**: `3`
- **Queue polling**: Automatic status checking every 2 seconds
- **Timeout**: 60 seconds maximum wait time

#### N8N Integration

Currently uses a mock endpoint. Replace the URL in `popup.js`:

```javascript
// Replace this URL with your actual n8n webhook
const mockResponse = await fetch('YOUR_N8N_WEBHOOK_URL', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    transcription: transcription,
    timestamp: new Date().toISOString(),
    source: 'chrome-extension-mic'
  })
});
```

## File Structure

```
extension-mic/
├── manifest.json          # Chrome extension manifest
├── popup.html            # Extension popup interface
├── popup.js              # Main functionality and API integration
├── background.js         # Background service worker
├── fal-client.js         # Simplified fal.ai client for Chrome extensions
├── package.json          # Node.js dependencies
├── env-example.txt       # Environment variables example
└── README.md            # This file
```

## Permissions

The extension requires these permissions:
- **Microphone access**: To record audio
- **Storage**: To save API keys and transcriptions
- **Host permissions**: To communicate with fal.ai and n8n APIs

## Troubleshooting

### Microphone Access Denied

**Method 1: Test Microphone Button**
1. Click the extension icon to open the popup
2. Click the "Test Microphone Access" button (this will trigger permission request)
3. Allow microphone access when Chrome prompts you
4. If successful, try recording normally

**Method 2: Chrome Extensions Settings**
1. Go to `chrome://extensions/`
2. Find "Audio Transcription Extension"
3. Click "Details"
4. Click "Site settings" (or "Permissions")
5. Set Microphone to "Allow"

**Method 3: Chrome Settings**
1. Go to Chrome Settings (⋮ menu → Settings)
2. Navigate to Privacy and security → Site settings
3. Click on Microphone
4. Find your extension in the "Not allowed" list and move it to "Allowed"

**Method 4: Reset Extension Permissions**
1. Go to `chrome://extensions/`
2. Find your Audio Transcription Extension
3. Click "Details"
4. Click "Extensions on chrome-extension-scheme"
5. Reset microphone permissions

**Method 5: Reload Extension**
1. Go to `chrome://extensions/`
2. Click the refresh/reload button on the extension
3. Try recording again

### API Key Errors
- Verify your FAL.AI API key is correct
- Check your FAL.AI account has sufficient credits
- Ensure the API key has appropriate permissions

### Transcription Failures
- Check your internet connection
- Verify the audio was recorded properly (try speaking louder/clearer)
- Check browser console for detailed error messages

### Extension Not Loading
- Ensure all files are in the correct directory
- Check for JavaScript errors in Chrome DevTools
- Verify the manifest.json is valid

## Development

### Local Development

1. Make changes to the extension files
2. Go to `chrome://extensions/`
3. Click the refresh button on the extension card
4. Test your changes

### Adding Features

The extension is built with modular JavaScript classes:
- `AudioRecorder`: Handles recording and processing
- Modify `popup.js` to add new functionality
- Update `manifest.json` for new permissions

## Security Notes

- API keys are stored securely in Chrome's sync storage
- Audio data is sent as base64 to maintain privacy
- No audio files are permanently stored locally

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Ensure all dependencies and permissions are configured correctly 