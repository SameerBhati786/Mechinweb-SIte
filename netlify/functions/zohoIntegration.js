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
    hasOrgId: !!ZOHO_CONFIG.organizationId
  });
};

// Get Zoho access token with enhanced error handling
const getZohoAccessToken = async () => {
  try {
    log('info', 'Requesting Zoho access token...');
    
    const response = await axios.post('https://accounts.zoho.in/oauth/v2/token', null, {
      params: {
        refresh_token: ZOHO_CONFIG.refreshToken,
        client_id: ZOHO_CONFIG.clientId,
        client_secret: ZOHO_CONFIG.clientSecret,
        grant_type: 'refresh_token'
      },
      timeout: 10000 // 10 second timeout
    });

    log('info', 'Zoho access token received', {
      tokenType: response.data.token_type,
      expiresIn: response.data.expires_in
    });

    return response.data.access_token;
  } catch (error) {
    log('error', 'Failed to get Zoho access token', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    if (error.response?.status === 400) {
      throw new Error('Invalid Zoho credentials. Please check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN.');
    } else if (error.response?.status === 401) {
      throw new Error('Zoho refresh token expired. Please regenerate the refresh token.');
    } else {
      throw new Error(`Zoho authentication failed: ${error.message}`);
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
      contactId: response.data.contact?.contact_id
    });

    return response.data.contact.contact_id;
  } catch (error) {
    log('error', 'Failed to create Zoho customer', {
      status: error.response?.status,
      data: error.response?.data
    });
    
    // If customer already exists, try to find them
    if (error.response?.status === 400) {
      log('info', 'Customer might already exist, searching...');
      return await findZohoCustomer(accessToken, customerData.email);
    }
    throw error;
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
      const customerId = response.data.contacts[0].contact_id;
      log('info', 'Found existing Zoho customer', { customerId });
      return customerId;
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
      currency: invoicePayload.currency_code
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
      total: invoice.total
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
    path: event.path
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

    // Parse request
    const url = new URL(`https://example.com${event.path}`);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    
    log('info', 'Processing request', {
      pathSegments,
      method: event.httpMethod
    });

    // Get access token
    const accessToken = await getZohoAccessToken();

    // Route requests
    if (event.httpMethod === 'POST') {
      const requestData = JSON.parse(event.body || '{}');
      
      if (pathSegments.includes('customers')) {
        // Create customer
        const customerId = await createZohoCustomer(accessToken, requestData);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            contact_id: customerId,
            requestId
          })
        };
      } else if (pathSegments.includes('invoices')) {
        // Create invoice
        const invoice = await createZohoInvoice(accessToken, requestData.customerId, requestData);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            success: true,
            invoice,
            requestId
          })
        };
      }
    } else if (event.httpMethod === 'GET') {
      if (pathSegments.includes('invoices') && pathSegments.length >= 2) {
        // Get invoice status
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
    }

    // Invalid endpoint
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Endpoint not found',
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