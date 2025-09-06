import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface ZohoCustomerRequest {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

interface ZohoInvoiceRequest {
  customerId: string;
  serviceItems: Array<{
    serviceId: string;
    serviceName: string;
    packageType: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  currency: string;
  notes?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    console.log('Zoho integration request:', path, req.method);

    // Validate Zoho credentials
    const zohoConfig = {
      clientId: Deno.env.get('ZOHO_CLIENT_ID'),
      clientSecret: Deno.env.get('ZOHO_CLIENT_SECRET'),
      refreshToken: Deno.env.get('ZOHO_REFRESH_TOKEN'),
      organizationId: Deno.env.get('ZOHO_ORGANIZATION_ID')
    };

    console.log('Zoho config check:', {
      hasClientId: !!zohoConfig.clientId,
      hasClientSecret: !!zohoConfig.clientSecret,
      hasRefreshToken: !!zohoConfig.refreshToken,
      hasOrgId: !!zohoConfig.organizationId
    });

    if (!zohoConfig.clientId || !zohoConfig.clientSecret || !zohoConfig.refreshToken) {
      throw new Error('Zoho credentials not configured. Please check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN environment variables.');
    }

    // Get Zoho access token
    if (path.includes('/token')) {
      const tokenResponse = await getZohoAccessToken(zohoConfig);
      return new Response(JSON.stringify(tokenResponse), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Create Zoho customer
    if (path.includes('/customers') && req.method === 'POST') {
      const customerData: ZohoCustomerRequest = await req.json();
      const customer = await createZohoCustomer(customerData, zohoConfig);
      return new Response(JSON.stringify(customer), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Create Zoho invoice
    if (path.includes('/invoices') && req.method === 'POST') {
      const invoiceData: ZohoInvoiceRequest = await req.json();
      const invoice = await createZohoInvoice(invoiceData, zohoConfig);
      return new Response(JSON.stringify(invoice), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Get invoice details
    if (path.includes('/invoices/') && req.method === 'GET') {
      const invoiceId = path.split('/').pop();
      const invoice = await getZohoInvoice(invoiceId!, zohoConfig);
      return new Response(JSON.stringify(invoice), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    console.error('Zoho integration error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: {
          timestamp: new Date().toISOString(),
          path: new URL(req.url).pathname
        }
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});

async function getZohoAccessToken(config: any): Promise<ZohoTokenResponse> {
  console.log('Getting Zoho access token...');
  
  const response = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Zoho token error:', response.status, errorText);
    throw new Error(`Failed to get Zoho access token: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json();
  console.log('Zoho token obtained successfully');
  return tokenData;
}

async function createZohoCustomer(customerData: ZohoCustomerRequest, config: any): Promise<any> {
  console.log('Creating Zoho customer:', customerData.email);
  
  const tokenResponse = await getZohoAccessToken(config);
  
  const customerPayload = {
    contact_name: customerData.name,
    company_name: customerData.company || '',
    email: customerData.email,
    phone: customerData.phone || ''
  };

  const response = await fetch('https://invoice.zoho.com/api/v3/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': config.organizationId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(customerPayload)
  });

  if (!response.ok) {
    // If customer already exists, try to find them
    console.log('Customer might already exist, searching...');
    return await findZohoCustomer(customerData.email, config);
  }

  const data = await response.json();
  console.log('Zoho customer created:', data.contact?.contact_id);
  return data.contact;
}

async function findZohoCustomer(email: string, config: any): Promise<any> {
  const tokenResponse = await getZohoAccessToken(config);
  
  const response = await fetch(`https://invoice.zoho.com/api/v3/contacts?email=${encodeURIComponent(email)}`, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': config.organizationId
    }
  });

  if (!response.ok) {
    throw new Error('Customer not found and could not be created');
  }

  const data = await response.json();
  if (!data.contacts || data.contacts.length === 0) {
    throw new Error('Customer not found');
  }
  
  return data.contacts[0];
}

async function createZohoInvoice(invoiceData: ZohoInvoiceRequest, config: any): Promise<any> {
  console.log('Creating Zoho invoice for customer:', invoiceData.customerId);
  
  const tokenResponse = await getZohoAccessToken(config);
  
  const lineItems = invoiceData.serviceItems.map(item => ({
    name: item.serviceName,
    description: `${item.serviceName} - ${item.packageType} Package (Quantity: ${item.quantity})`,
    rate: item.unitPrice,
    quantity: item.quantity,
    item_total: item.totalPrice
  }));

  const invoicePayload = {
    customer_id: invoiceData.customerId,
    invoice_number: `INV-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    line_items: lineItems,
    notes: invoiceData.notes || 'Thank you for choosing Mechinweb!',
    terms: 'Payment due within 30 days.',
    currency_code: invoiceData.currency
  };

  console.log('Invoice payload:', invoicePayload);

  const response = await fetch('https://invoice.zoho.com/api/v3/invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': config.organizationId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(invoicePayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Zoho invoice creation error:', response.status, errorText);
    throw new Error(`Failed to create Zoho invoice: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log('Zoho invoice created:', data.invoice?.invoice_id);
  
  // Return invoice with payment URL
  const invoice = data.invoice;
  return {
    invoice_id: invoice.invoice_id,
    invoice_number: invoice.invoice_number,
    payment_url: `https://invoice.zoho.com/invoices/${invoice.invoice_id}/payment`,
    total: invoice.total,
    status: invoice.status
  };
}

async function getZohoInvoice(invoiceId: string, config: any): Promise<any> {
  const tokenResponse = await getZohoAccessToken(config);
  
  const response = await fetch(`https://invoice.zoho.com/api/v3/invoices/${invoiceId}`, {
    headers: {
      'Authorization': `Zoho-oauthtoken ${tokenResponse.access_token}`,
      'X-com-zoho-invoice-organizationid': config.organizationId
    }
  });

  if (!response.ok) {
    throw new Error('Invoice not found');
  }

  const data = await response.json();
  return data.invoice;
}