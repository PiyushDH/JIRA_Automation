// Simplified fal.ai client for Chrome Extensions
class FalClient {
  constructor() {
    this.apiKey = null;
    this.queueUrl = 'https://queue.fal.run';
    this.runUrl = 'https://fal.run';
  }

  config(options) {
    if (options.credentials) {
      this.apiKey = options.credentials;
    }
  }

  async setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  // Storage upload functionality using FAL's two-step process
  get storage() {
    return {
      upload: async (file) => {
        if (!this.apiKey) {
          throw new Error('API key not configured');
        }

        try {
          // Step 1: Initiate upload (get signed URL)
          const initiateResponse = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json; charset=utf-8',
              'Authorization': `Key ${this.apiKey}`,
              'User-Agent': 'fal-client/chrome-extension'
            },
            body: JSON.stringify({
              file_name: file.name,
              content_type: file.type
            })
          });

          if (!initiateResponse.ok) {
            const errorText = await initiateResponse.text();
            throw new Error(`Initiate upload failed: ${initiateResponse.status} - ${errorText}`);
          }

          const initiateData = await initiateResponse.json();
          const { upload_url, file_url } = initiateData;

          if (!upload_url || !file_url) {
            throw new Error('Invalid response from initiate upload');
          }

          // Step 2: Upload file to signed URL
          const uploadResponse = await fetch(upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': file.type
            },
            body: file
          });

          if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${uploadResponse.status}`);
          }

          // Return the file URL for use with FAL models
          return file_url;

        } catch (error) {
          console.error('Storage upload error:', error);
          throw new Error(`Upload failed: ${error.message}`);
        }
      }
    };
  }

  // Queue functionality
  get queue() {
    return {
      submit: async (endpoint, options) => {
        if (!this.apiKey) {
          throw new Error('API key not configured');
        }

        const response = await fetch(`${this.runUrl}/${endpoint}`, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(options.input)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Submit failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        
        // Check if this is a direct result (not queued)
        if (result.text !== undefined || result.chunks !== undefined) {
          // This is a direct transcription result, not a queue response
          return { 
            isDirect: true, 
            result: result 
          };
        }
        
        // This is a queue response with request_id
        return result;
      },

      status: async (endpoint, options) => {
        if (!this.apiKey) {
          throw new Error('API key not configured');
        }

        const response = await fetch(`${this.queueUrl}/${endpoint}/requests/${options.requestId}/status`, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${this.apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }

        return await response.json();
      },

      result: async (endpoint, options) => {
        if (!this.apiKey) {
          throw new Error('API key not configured');
        }

        const response = await fetch(`${this.queueUrl}/${endpoint}/requests/${options.requestId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${this.apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error(`Result fetch failed: ${response.status}`);
        }

        return await response.json();
      }
    };
  }

  // Subscribe method for easier usage
  async subscribe(endpoint, options = {}) {
    try {
      // Submit the request
      const submitResult = await this.queue.submit(endpoint, options);
      console.log('Submit result:', submitResult);
      
      // Check if we got a direct result (not queued)
      if (submitResult.isDirect) {
        console.log('Got direct result (not queued):', submitResult.result);
        return {
          data: submitResult.result,
          requestId: 'direct-response'
        };
      }
      
      const requestId = submitResult.request_id;

      if (!requestId) {
        throw new Error('No request ID received');
      }

      // Poll for completion
      const maxAttempts = 60; // 2 minutes max
      let attempts = 0;

      while (attempts < maxAttempts) {
        attempts++;
        
        // Call onQueueUpdate if provided
        if (options.onQueueUpdate) {
          options.onQueueUpdate({
            status: 'IN_PROGRESS',
            requestId: requestId,
            attempt: attempts,
            maxAttempts: maxAttempts
          });
        }

        const status = await this.queue.status(endpoint, { requestId });
        console.log('Status check result:', status);

        if (status.status === 'COMPLETED') {
          const result = await this.queue.result(endpoint, { requestId });
          console.log('Final result:', result);
          
          return {
            data: result,
            requestId: requestId
          };
        } else if (status.status === 'FAILED') {
          const errorMsg = status.error || status.logs || 'Unknown error';
          throw new Error(`Job failed: ${errorMsg}`);
        }

        // Wait 2 seconds before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      throw new Error('Timeout waiting for completion');
    } catch (error) {
      console.error('Subscribe error:', error);
      throw error;
    }
  }
}

// Create global instance
window.fal = new FalClient();