// Centralized safe API response utility
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const response = await originalFetch(...args);
            
            // Override json() to prevent 'Unexpected token <'
            const originalJson = response.json.bind(response);
            response.json = async function() {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await originalJson();
                } else {
                    const text = await response.text();
                    console.error('API returned non-JSON response:', text.substring(0, 200));
                    // Return a consistent JSON error structure
                    return {
                        success: false,
                        message: 'Server returned an invalid response format (not JSON). HTTP ' + response.status
                    };
                }
            };
            
            return response;
        } catch (error) {
            console.error('Fetch network error:', error);
            throw error;
        }
    };
})();
console.log('✅ Centralized API error handler loaded.');
