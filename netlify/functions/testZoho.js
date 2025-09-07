// Test function to verify Zoho configuration
const axios = require('axios');

exports.handler = async (event, context) => {
  console.log('Test Zoho function invoked');
  
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Check Zoho environment variables
    const zohoConfig = {
      clientId: process.env.ZOHO_CLIENT_ID,
      clientSecret: process.env.ZOHO_CLIENT_SECRET,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN,
      organizationId: process.env.ZOHO_ORGANIZATION_ID
    };

    const envCheck = {
      ZOHO_CLIENT_ID: !!zohoConfig.clientId,
      ZOHO_CLIENT_SECRET: !!zohoConfig.clientSecret,
      ZOHO_REFRESH_TOKEN: !!zohoConfig.refreshToken,
      ZOHO_ORGANIZATION_ID: !!zohoConfig.organizationId,
      CLIENT_ID_LENGTH: zohoConfig.clientId?.length || 0,
      REFRESH_TOKEN_LENGTH: zohoConfig.refreshToken?.length || 0
    };

    console.log('Zoho environment check:', envCheck);

    // Check for missing credentials
    const missing = [];
    if (!zohoConfig.clientId) missing.push('ZOHO_CLIENT_ID');
    if (!zohoConfig.clientSecret) missing.push('ZOHO_CLIENT_SECRET');
    if (!zohoConfig.refreshToken) missing.push('ZOHO_REFRESH_TOKEN');
    if (!zohoConfig.organizationId) missing.push('ZOHO_ORGANIZATION_ID');

    if (missing.length > 0) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: false,
          error: `Missing Zoho configuration: ${missing.join(', ')}`,
          debug: envCheck
        })
      };
    }

    // Test Zoho API connection
    console.log('Testing Zoho API connection...');
    
    const tokenResponse = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        refresh_token: zohoConfig.refreshToken,
        client_id: zohoConfig.clientId,
        client_secret: zohoConfig.clientSecret,
        grant_type: 'refresh_token'
      },
      timeout: 10000
    });

    console.log('Zoho token response:', {
      status: tokenResponse.status,
      tokenType: tokenResponse.data.token_type,
      expiresIn: tokenResponse.data.expires_in
    });

    // Test API call with the token
    const accessToken = tokenResponse.data.access_token;
    
    const apiTestResponse = await axios.get('https://invoice.zoho.com/api/v3/contacts', {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'X-com-zoho-invoice-organizationid': zohoConfig.organizationId
      },
      params: {
        per_page: 1
      },
      timeout: 15000
    });

    console.log('Zoho API test successful:', {
      status: apiTestResponse.status,
      contactsCount: apiTestResponse.data.contacts?.length || 0
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Zoho configuration is working correctly',
        timestamp: new Date().toISOString(),
        debug: {
          ...envCheck,
          tokenObtained: true,
          apiCallSuccessful: true,
          organizationAccess: true
        }
      })
    };

  } catch (error) {
    console.error('Zoho test failed:', error);
    
    let errorMessage = error.message;
    let errorType = 'unknown';
    
    if (error.response) {
      errorType = 'api_error';
      errorMessage = `API Error ${error.response.status}: ${error.response.data?.error || error.response.statusText}`;
      
      if (error.response.status === 400) {
        errorMessage = 'Invalid Zoho credentials. Please check your ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN.';
      } else if (error.response.status === 401) {
        errorMessage = 'Zoho refresh token expired. Please regenerate your refresh token.';
      } else if (error.response.status === 403) {
        errorMessage = 'Access denied. Please check your ZOHO_ORGANIZATION_ID and API permissions.';
      }
    } else if (error.code === 'ECONNABORTED') {
      errorType = 'timeout';
      errorMessage = 'Request timeout. Zoho API might be slow or unreachable.';
    } else if (error.code === 'ENOTFOUND') {
      errorType = 'network';
      errorMessage = 'Network error. Cannot reach Zoho servers.';
    }
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        errorType,
        timestamp: new Date().toISOString(),
        debug: {
          ZOHO_CLIENT_ID: !!process.env.ZOHO_CLIENT_ID,
          ZOHO_CLIENT_SECRET: !!process.env.ZOHO_CLIENT_SECRET,
          ZOHO_REFRESH_TOKEN: !!process.env.ZOHO_REFRESH_TOKEN,
          ZOHO_ORGANIZATION_ID: !!process.env.ZOHO_ORGANIZATION_ID,
          errorDetails: error.response?.data || error.message
        }
      })
    };
  }
};