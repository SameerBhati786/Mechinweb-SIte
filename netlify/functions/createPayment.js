const axios = require('axios');

// Enhanced logging
const log = (level, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data || '');
};

// Zoho configuration
const ZOHO_CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID,
  clientSecret: process.env.ZOHO_CLIENT_SECRET,
  refreshToken: process.env.ZOHO_REFRESH_TOKEN,
  organizationId: process.env.ZOHO_ORGANIZATION_ID,
  baseUrl: 'https://invoice.zoho.com/api/v3'
};

// Get Zoho access token
const getZohoAccessToken = async () => {
  try {
    log('info', 'Getting Zoho access token for payment...');
    
    const response = await axios.post('https://accounts.zoho.com/oauth/v2/token', null, {
      params: {
        refresh_token: ZOHO_CONFIG.refreshToken,
        client_id: ZOHO_CONFIG.clientId,
        client_secret: ZOHO_CONFIG.clientSecret,
        grant_type: 'refresh_token'
      },
      timeout: 10000
    });

    return response.data.access_token;
  } catch (error) {
    log('error', 'Zoho token error', error.response?.data || error.message);
    throw new Error(`Zoho authentication failed: ${error.response?.data?.error || error.message}`);
  }
};

// Create customer in Zoho
const createZohoCustomer = async (accessToken, customerData) => {
  try {
    const customerPayload = {
      contact_name: customerData.name,
      company_name: customerData.company || '',
      email: customerData.email,
      phone: customerData.phone || ''
    };

    log('info', 'Creating Zoho customer', { email: customerData.email });

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

    return response.data.contact.contact_id;
  } catch (error) {
    // If customer exists, find them
    if (error.response?.status === 400) {
      return await findZohoCustomer(accessToken, customerData.email);
    }
    throw error;
  }
};

// Find existing customer
const findZohoCustomer = async (accessToken, email) => {
  try {
    const response = await axios.get(
      `${ZOHO_CONFIG.baseUrl}/contacts`,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'X-com-zoho-invoice-organizationid': ZOHO_CONFIG.organizationId
        },
        params: { email },
        timeout: 15000
      }
    );

    if (response.data.contacts && response.data.contacts.length > 0) {
      return response.data.contacts[0].contact_id;
    }
    throw new Error('Customer not found');
  } catch (error) {
    log('error', 'Customer search failed', error);
    throw error;
  }
};

// Create Zoho invoice
const createZohoInvoice = async (accessToken, customerId, invoiceData) => {
  try {
    log('info', 'Creating Zoho invoice', { customerId });

    const lineItems = invoiceData.serviceItems.map(item => ({
      name: item.serviceName,
      description: `${item.serviceName} - ${item.packageType} Package`,
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
      currency_code: invoiceData.currency
    };

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
    log('info', 'Invoice created successfully', {
      invoiceId: invoice.invoice_id,
      total: invoice.total
    });

    return {
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      payment_url: `https://invoice.zoho.com/invoices/${invoice.invoice_id}/payment`,
      total: invoice.total,
      status: invoice.status
    };
  } catch (error) {
    log('error', 'Invoice creation failed', {
      status: error.response?.status,
      data: error.response?.data
    });
    throw new Error(`Invoice creation failed: ${error.response?.data?.message || error.message}`);
  }
};

// Main handler
exports.handler = async (event, context) => {
  const requestId = context.awsRequestId || Date.now().toString();
  
  log('info', 'Payment function invoked', {
    requestId,
    method: event.httpMethod,
    path: event.path
  });

  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Validate Zoho config
    const missing = [];
    if (!ZOHO_CONFIG.clientId) missing.push('ZOHO_CLIENT_ID');
    if (!ZOHO_CONFIG.clientSecret) missing.push('ZOHO_CLIENT_SECRET');
    if (!ZOHO_CONFIG.refreshToken) missing.push('ZOHO_REFRESH_TOKEN');
    if (!ZOHO_CONFIG.organizationId) missing.push('ZOHO_ORGANIZATION_ID');

    if (missing.length > 0) {
      throw new Error(`Missing Zoho configuration: ${missing.join(', ')}`);
    }

    // Parse request data
    const requestData = JSON.parse(event.body || '{}');
    log('info', 'Request data parsed', {
      serviceId: requestData.serviceId,
      packageType: requestData.packageType,
      currency: requestData.currency
    });

    // Get access token
    const accessToken = await getZohoAccessToken();

    // Create or find customer
    const customerId = await createZohoCustomer(accessToken, requestData.customerData);

    // Create invoice
    const invoice = await createZohoInvoice(accessToken, customerId, {
      serviceItems: requestData.serviceItems,
      currency: requestData.currency,
      notes: requestData.notes
    });

    log('info', 'Payment process completed successfully', {
      requestId,
      invoiceId: invoice.invoice_id,
      paymentUrl: invoice.payment_url
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        invoice,
        requestId,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    log('error', 'Payment function error', {
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
          hasZohoClientId: !!ZOHO_CONFIG.clientId,
          hasZohoClientSecret: !!ZOHO_CONFIG.clientSecret,
          hasZohoRefreshToken: !!ZOHO_CONFIG.refreshToken,
          hasZohoOrgId: !!ZOHO_CONFIG.organizationId
        }
      })
    };
  }
};