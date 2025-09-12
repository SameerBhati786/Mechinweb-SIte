const axios = require('axios');

// Enhanced logging function
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
};

// Zoho API Configuration
const ZOHO_CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  organizationId: process.env.ZOHO_ORGANIZATION_ID,
  baseUrl: 'https://invoice.zoho.in/api/v3'
};

// Validate Zoho configuration
const validateZohoConfig = () => {
  const missing = [];
  if (!ZOHO_CONFIG.clientId) missing.push('ZOHO_CLIENT_ID');
  if (!ZOHO_CONFIG.clientSecret) missing.push('ZOHO_CLIENT_SECRET');
  if (!ZOHO_CONFIG.refreshToken) missing.push('ZOHO_REFRESH_TOKEN');
  if (!ZOHO_CONFIG.organizationId) missing.push('ZOHO_ORGANIZATION_ID');

  if (missing.length > 0) {
    throw new Error(`Missing Zoho configuration: ${missing.join(', ')}`);
  }

  log('info', 'Zoho configuration validated', {
    hasClientId: !!ZOHO_CONFIG.clientId,
    hasClientSecret: !!ZOHO_CONFIG.clientSecret,
    hasRefreshToken: !!ZOHO_CONFIG.refreshToken,
    hasOrgId: !!ZOHO_CONFIG.organizationId,
    clientIdLength: ZOHO_CONFIG.clientId?.length,
    refreshTokenLength: ZOHO_CONFIG.refreshToken?.length,
    orgIdLength: ZOHO_CONFIG.organizationId?.length
  });
};

// Get Zoho access token with proper error handling
const getZohoAccessToken = async () => {
  try {
    log('info', 'Requesting Zoho access token...');
    
    const tokenUrl = 'https://accounts.zoho.in/oauth/v2/token';
    const params = new URLSearchParams({
      refresh_token: ZOHO_CONFIG.refreshToken,
      client_id: ZOHO_CONFIG.clientId,
      client_secret: ZOHO_CONFIG.clientSecret,
      grant_type: 'refresh_token'
    });

    log('info', 'Token request params', {
      grant_type: 'refresh_token',
      client_id: ZOHO_CONFIG.clientId,
      refresh_token_length: ZOHO_CONFIG.refreshToken?.length,
      url: tokenUrl
    });

    const response = await axios.post(tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    });

    log('info', 'Token response received', {
      status: response.status,
      statusText: response.statusText,
      responseData: response.data
    });

    if (!response.data || !response.data.access_token) {
      throw new Error('Invalid token response: missing access_token');
    }

    const tokenData = response.data;
    log('info', 'Zoho access token received successfully', {
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      hasAccessToken: !!tokenData.access_token,
      accessTokenLength: tokenData.access_token?.length
    });

    return tokenData.access_token;
  } catch (error) {
    log('error', 'Failed to get Zoho access token', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
      code: error.code
    });
    
    if (error.response?.status === 400) {
      const errorData = error.response.data;
      if (errorData.error === 'invalid_grant') {
        throw new Error('Zoho refresh token has expired. Please regenerate the refresh token in Zoho Developer Console.');
      } else if (errorData.error === 'invalid_client') {
        throw new Error('Invalid Zoho client credentials. Please check ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.');
      } else {
        throw new Error(`Zoho token error: ${errorData.error_description || errorData.error}`);
      }
    } else if (error.response?.status === 401) {
      throw new Error('Zoho authentication failed. Please check your credentials.');
    } else {
      throw new Error(`Zoho token request failed: ${error.message}`);
    }
  }
};

// Test Zoho API connection
const testZohoConnection = async (accessToken) => {
  try {
    log('info', 'Testing Zoho API connection...');
    
    const response = await axios.get(`${ZOHO_CONFIG.baseUrl}/contacts`, {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
      },
      params: {
        per_page: 1
      },
      timeout: 15000
    });

    log('info', 'Zoho API connection test successful', {
      status: response.status,
      contactsCount: response.data.contacts?.length || 0,
      organizationAccess: true
    });

    return true;
  } catch (error) {
    log('error', 'Zoho API connection test failed', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });

    if (error.response?.status === 401) {
      throw new Error('Zoho API authorization failed. Check organization ID and API permissions.');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied. Check ZOHO_ORGANIZATION_ID and ensure API access is enabled.');
    } else {
      throw new Error(`Zoho API test failed: ${error.message}`);
    }
  }
};

// Create or find Zoho customer
const createZohoCustomer = async (accessToken, customerData) => {
  try {
    log('info', 'Creating Zoho customer', { email: customerData.email });
    
    const customerPayload = {
      contact_name: customerData.name,
      company_name: customerData.company || '',
      email: customerData.email,
      phone: customerData.phone || ''
    };

    log('info', 'Customer payload', customerPayload);

    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrl}/contacts`,
      customerPayload,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    log('info', 'Zoho customer created successfully', {
      contactId: response.data.contact?.contact_id,
      contactName: response.data.contact?.contact_name
    });

    return {
      contact_id: response.data.contact.contact_id,
      contact_name: response.data.contact.contact_name,
      email: response.data.contact.email
    };
  } catch (error) {
    log('error', 'Failed to create Zoho customer', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    
    // If customer already exists, try to find them
    if (error.response?.status === 400 && error.response?.data?.message?.includes('already exists')) {
      log('info', 'Customer already exists, searching...');
      return await findZohoCustomer(accessToken, customerData.email);
    }
    
    throw new Error(`Customer creation failed: ${error.response?.data?.message || error.message}`);
  }
};

// Find existing Zoho customer
const findZohoCustomer = async (accessToken, email) => {
  try {
    log('info', 'Searching for existing Zoho customer', { email });
    
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/contacts`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
        },
        params: {
          email: email
        },
        timeout: 15000
      }
    );

    if (response.data.contacts && response.data.contacts.length > 0) {
      const customer = response.data.contacts[0];
      log('info', 'Found existing Zoho customer', { 
        contactId: customer.contact_id,
        contactName: customer.contact_name 
      });
      return {
        contact_id: customer.contact_id,
        contact_name: customer.contact_name,
        email: customer.email
      };
    }
    
    throw new Error('Customer not found');
  } catch (error) {
    log('error', 'Failed to find Zoho customer', error);
    throw new Error(`Customer lookup failed: ${error.message}`);
  }
};

// Create Zoho invoice
const createZohoInvoice = async (accessToken, customerId, invoiceData) => {
  try {
    log('info', 'Creating Zoho invoice', { customerId, currency: invoiceData.currency });
    
    const lineItems = invoiceData.serviceItems.map(item => ({
      name: item.serviceName,
      description: `${item.serviceName} - ${item.packageType} Package (Quantity: ${item.quantity})`,
      rate: item.unitPrice,
      quantity: item.quantity,
      item_total: item.totalPrice
    }));

    const invoicePayload = {
      customer_id: customerId,
      invoice_number: `INV-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      line_items: lineItems,
      notes: invoiceData.notes || 'Thank you for choosing Mechinweb!',
      terms: 'Payment due within 30 days.',
      currency_code: invoiceData.currency,
      is_inclusive_tax: false
    };

    log('info', 'Invoice payload prepared', {
      invoiceNumber: invoicePayload.invoice_number,
      lineItemsCount: lineItems.length,
      currency: invoicePayload.currency_code,
      customerId: customerId
    });

    const response = await axios.post(
      `${ZOHO_CONFIG.baseUrl}/invoices`,
      invoicePayload,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const invoice = response.data.invoice;
    log('info', 'Zoho invoice created successfully', {
      invoiceId: invoice.invoice_id,
      invoiceNumber: invoice.invoice_number,
      total: invoice.total,
      status: invoice.status
    });

    return {
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      payment_url: `https://invoice.zoho.in/invoices/${invoice.invoice_id}/payment`,
      total: invoice.total,
      status: invoice.status,
      customer_id: customerId
    };
  } catch (error) {
    log('error', 'Failed to create Zoho invoice', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(`Invoice creation failed: ${error.response?.data?.message || error.message}`);
  }
};

// Get invoice status
const getZohoInvoiceStatus = async (accessToken, invoiceId) => {
  try {
    log('info', 'Getting Zoho invoice status', { invoiceId });
    
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/invoices/${invoiceId}`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
        },
        timeout: 15000
      }
    );

    const invoice = response.data.invoice;
    log('info', 'Invoice status retrieved', {
      invoiceId,
      status: invoice.status,
      total: invoice.total
    });

    return {
      status: invoice.status,
      total: invoice.total,
      payment_date: invoice.last_payment_date
    };
  } catch (error) {
    log('error', 'Failed to get invoice status', error);
    throw new Error(`Invoice status check failed: ${error.message}`);
  }
};

// Main handler function
exports.handler = async (event, context) => {
  const requestId = context.awsRequestId || Date.now().toString();
  
  log('info', 'Zoho integration function invoked', {
    requestId,
    method: event.httpMethod,
    path: event.path,
    headers: {
      authorization: event.headers.authorization ? 'present' : 'missing',
      contentType: event.headers['content-type']
    }
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Validate Zoho configuration
    validateZohoConfig();

    // Get access token first
    const accessToken = await getZohoAccessToken();
    
    // Test API connection
    await testZohoConnection(accessToken);

    // Parse request body for POST requests
    let requestData = {};
    if (event.httpMethod === 'POST' && event.body) {
      try {
        requestData = JSON.parse(event.body);
        log('info', 'Request data parsed', {
          hasCustomerData: !!requestData.customerData,
          hasServiceItems: !!requestData.serviceItems,
          currency: requestData.currency
        });
      } catch (parseError) {
        log('error', 'Failed to parse request body', parseError);
        throw new Error('Invalid JSON in request body');
      }
    }

    // Handle different request types
    if (event.httpMethod === 'POST') {
      // Handle customer creation and invoice creation in one call
      if (requestData.customerData && requestData.serviceItems) {
        log('info', 'Processing customer creation and invoice generation');
        
        // Create or find customer
        const customer = await createZohoCustomer(accessToken, requestData.customerData);
        
        // Create invoice
        const invoice = await createZohoInvoice(accessToken, customer.contact_id, {
          serviceItems: requestData.serviceItems,
          currency: requestData.currency || 'USD',
          notes: requestData.notes
        });

        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            customer,
            invoice,
            requestId,
            timestamp: new Date().toISOString()
          })
        };
      }
      
      // Handle customer creation only
      else if (requestData.name && requestData.email) {
        const customer = await createZohoCustomer(accessToken, requestData);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            customer,
            requestId
          })
        };
      }
      
      else {
        throw new Error('Invalid request data. Expected customerData and serviceItems or customer details.');
      }
    }
    
    // Handle GET requests (status checks, etc.)
    else if (event.httpMethod === 'GET') {
      const url = new URL(`https://example.com${event.path}`);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      
      // Get invoice status
      if (pathSegments.includes('invoices') && pathSegments.length >= 3) {
        const invoiceId = pathSegments[pathSegments.length - 1];
        const status = await getZohoInvoiceStatus(accessToken, invoiceId);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            status,
            requestId
          })
        };
      }
      
      // Test connection
      else {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            message: 'Zoho integration is working correctly',
            timestamp: new Date().toISOString(),
            requestId,
            config: {
              hasClientId: !!ZOHO_CONFIG.clientId,
              hasClientSecret: !!ZOHO_CONFIG.clientSecret,
              hasRefreshToken: !!ZOHO_CONFIG.refreshToken,
              hasOrgId: !!ZOHO_CONFIG.organizationId,
              apiConnectionSuccessful: true
            }
          })
        };
      }
    }

    // Invalid method
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
        requestId
      })
    };

  } catch (error) {
    log('error', 'Zoho integration function error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        requestId,
        timestamp: new Date().toISOString(),
        debug: {
          hasClientId: !!ZOHO_CONFIG.clientId,
          hasClientSecret: !!ZOHO_CONFIG.clientSecret,
          hasRefreshToken: !!ZOHO_CONFIG.refreshToken,
          hasOrgId: !!ZOHO_CONFIG.organizationId
        }
      })
    };
  }
};