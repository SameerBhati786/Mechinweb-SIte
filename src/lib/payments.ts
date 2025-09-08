import { supabase } from './supabase';
import { ZohoService, ZohoServiceItem } from './zoho';
import { convertCurrency, getPreferredCurrency, getAllExchangeRates, formatCurrency } from '../utils/currency';

export interface PaymentIntent {
  invoice_id: string;
  payment_url?: string;
  amount: number;
  currency: string;
}

export interface ServicePurchaseData {
  serviceId: string;
  packageType: string;
  quantity: number;
  currency: string;
  totalAmount: number;
}

export class PaymentService {
  // Create payment intent with enhanced Zoho integration
  static async createPaymentIntent(
    serviceId: string,
    packageType: string,
    totalAmount: number,
    currency: string,
    quantity: number = 1
  ): Promise<PaymentIntent> {
    try {
      console.log(`Creating payment intent: ${totalAmount} ${currency} for service ${serviceId}`);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      // Check if email is verified
      if (!user.email_confirmed_at) {
        throw new Error('Please verify your email before making purchases');
      }

      // Get client data
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!client) throw new Error('Client not found');

      // Get service data
      const { data: service } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .single();

      if (!service) throw new Error('Service not found');

      // Get user's preferred currency if not specified
      const targetCurrency = currency || await getPreferredCurrency();
      
      // Get current exchange rates for accurate conversion
      const rates = await getAllExchangeRates();
      console.log('Current exchange rates:', rates);
      
      // Convert amounts to all supported currencies for storage with proper rates
      const usdAmount = targetCurrency === 'USD' ? totalAmount : await convertCurrency(totalAmount, targetCurrency, 'USD');
      const inrAmount = await convertCurrency(usdAmount, 'USD', 'INR');
      const audAmount = await convertCurrency(usdAmount, 'USD', 'AUD');
      
      console.log(`Amount conversions: ${totalAmount} ${targetCurrency} = $${usdAmount} USD = ₹${inrAmount} INR = A$${audAmount} AUD`);
      
      // Create order in database
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          client_id: user.id,
          service_id: serviceId,
          package_type: packageType,
          amount_usd: usdAmount,
          amount_inr: inrAmount,
          amount_aud: audAmount,
          currency: targetCurrency,
          status: 'pending',
          payment_gateway: 'zoho'
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Call Netlify function to create Zoho invoice
      const response = await fetch('/.netlify/functions/zohoIntegration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerId: null, // Will be created
          serviceItems: [{
            serviceId: serviceId,
            serviceName: service.name,
            packageType,
            quantity,
            unitPrice: usdAmount / quantity,
            totalPrice: usdAmount
          }],
          currency: targetCurrency,
          notes: `Order ID: ${order.id}\nService: ${service.name}\nPackage: ${packageType}`,
          customerData: {
            name: client.name,
            email: client.email,
            phone: client.phone,
            company: client.company
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Payment creation failed: ${errorData.error}`);
      }

      const paymentData = await response.json();
      const zohoInvoice = paymentData.invoice;

      // Update order with Zoho invoice ID
      await supabase
        .from('orders')
        .update({
          zoho_invoice_id: zohoInvoice.invoice_id,
          zoho_customer_id: zohoInvoice.customer_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      return {
        invoice_id: zohoInvoice.invoice_id,
        payment_url: zohoInvoice.payment_url,
        amount: totalAmount,
        currency: targetCurrency
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  // Enhanced payment confirmation with real-time updates
  static async confirmPayment(invoiceId: string): Promise<boolean> {
    try {
      // Get invoice status from Zoho
      const invoiceStatus = await ZohoService.getInvoiceStatus(invoiceId);
      
      if (invoiceStatus.status === 'paid') {
        // Update order status with real-time notification
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('zoho_invoice_id', invoiceId)
          .single();

        if (order) {
          await supabase
            .from('orders')
            .update({ 
              status: 'paid',
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

          // Trigger real-time notification
          await this.notifyPaymentSuccess(order.client_id, order.id);
        }

        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error confirming payment:', error);
      return false;
    }
  }

  // Real-time payment notification
  private static async notifyPaymentSuccess(clientId: string, orderId: string): Promise<void> {
    try {
      // Send real-time notification via Supabase
      await supabase
        .from('notifications')
        .insert([{
          client_id: clientId,
          title: 'Payment Confirmed',
          message: `Your payment has been received. Order ${orderId} is now being processed.`,
          type: 'success',
          read: false
        }]);
    } catch (error) {
      console.error('Error sending payment notification:', error);
    }
  }

  // Process payment success with enhanced tracking
  static async processPaymentSuccess(
    invoiceId: string,
    serviceData: Omit<ServicePurchaseData, 'addOns'>
  ) {
    try {
      // Get order by invoice ID
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('zoho_invoice_id', invoiceId)
        .single();

      if (!order) throw new Error('Order not found');

      // Update order status to completed
      await supabase
        .from('orders')
        .update({ 
          status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

      // Create invoice record
      const { data: invoice } = await supabase
        .from('invoices')
        .insert([{
          order_id: order.id,
          client_id: order.client_id,
          invoice_number: `INV-${Date.now()}`,
          amount_usd: order.amount_usd,
          amount_inr: order.amount_inr,
          amount_aud: order.amount_aud,
          currency: order.currency,
          total_amount: serviceData.totalAmount,
          status: 'paid',
          due_date: new Date().toISOString()
        }])
        .select()
        .single();

      // Send confirmation email
      await this.sendPaymentConfirmationEmail(order.client_id, {
        orderId: order.id,
        invoiceId: invoice?.id,
        amount: serviceData.totalAmount,
        currency: order.currency,
        serviceName: serviceData.serviceId,
        packageType: serviceData.packageType,
        quantity: serviceData.quantity
      });

      // Sync with Zoho for real-time updates
      await ZohoService.syncOrderStatus(order.id);

      return {
        orderId: order.id,
        invoiceId: invoice?.id
      };
    } catch (error) {
      console.error('Error processing payment success:', error);
      throw error;
    }
  }

  // Send payment confirmation email
  private static async sendPaymentConfirmationEmail(
    clientId: string,
    paymentDetails: any
  ) {
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single();

      if (!client) return;

      // Call email service
      await supabase.functions.invoke('send-email', {
        body: {
          to: client.email,
          template: 'payment_confirmation',
          variables: {
            clientName: client.name,
            ...paymentDetails
          }
        }
      });
    } catch (error) {
      console.error('Error sending payment confirmation email:', error);
    }
  }

  // Get user orders with real-time updates
  static async getUserOrders() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          services (name, description)
        `)
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return orders || [];
    } catch (error) {
      console.error('Error getting user orders:', error);
      throw error;
    }
  }

  // Get user invoices with real-time updates
  static async getUserInvoices() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(`
          *,
          orders (
            services (name, description)
          )
        `)
        .eq('client_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return invoices || [];
    } catch (error) {
      console.error('Error getting user invoices:', error);
      throw error;
    }
  }

  // Real-time pricing calculator
  static calculateDynamicPricing(
    basePrice: number,
    quantity: number,
    currency: 'USD' | 'INR' = 'USD'
  ): {
    baseTotal: number;
    grandTotal: number;
    breakdown: Array<{ item: string; amount: number }>;
  } {
    const baseTotal = basePrice * quantity;
    const grandTotal = baseTotal;

    const breakdown = [
      { item: `Base service (${quantity} units)`, amount: baseTotal }
    ];

    return {
      baseTotal,
      grandTotal,
      breakdown
    };
  }
}