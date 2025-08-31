import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Shield, Clock, Users, Star, Home } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { convertCurrency, formatCurrency, getPreferredCurrency, detectUserLocation } from '../utils/currency';
import { PricingService } from '../lib/pricing';
import { PaymentService } from '../lib/payments';
import QuantitySelector from '../components/QuantitySelector';
import AddOnSelector from '../components/AddOnSelector';

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing: {
    basic: number;
    standard?: number;
    enterprise?: number;
  };
  features: {
    basic: string[];
    standard?: string[];
    enterprise?: string[];
  };
}

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  recommended?: boolean;
}

export function ServicePurchase() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [service, setService] = useState<Service | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<'basic' | 'standard' | 'enterprise'>('basic');
  const [quantity, setQuantity] = useState(1);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [userCurrency, setUserCurrency] = useState('USD');
  const [userLocation, setUserLocation] = useState('');
  const [convertedPricing, setConvertedPricing] = useState<any>({});
  const [convertedAddOns, setConvertedAddOns] = useState<AddOn[]>([]);

  const addOns: AddOn[] = [
    { 
      id: 'priority-support', 
      name: 'Priority Support', 
      description: '24/7 priority technical support with faster response times', 
      price: 15,
      recommended: true
    },
    { 
      id: 'extended-warranty', 
      name: 'Extended Support', 
      description: 'Extended 3-month support period after service completion', 
      price: 25 
    },
    { 
      id: 'per-incident-support', 
      name: 'Per Incident Support Package', 
      description: 'Additional troubleshooting support for future issues', 
      price: 20 
    },
    { 
      id: 'acronis-incident-support', 
      name: 'Acronis Incident Support', 
      description: 'Specialized Acronis backup troubleshooting support', 
      price: 15 
    }
  ];

  useEffect(() => {
    const initializePage = async () => {
      try {
        // Get current user
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        setUser(currentUser);

        // Detect user currency and location
        const [currency, location] = await Promise.all([
          getPreferredCurrency(),
          detectUserLocation()
        ]);
        
        setUserCurrency(currency);
        setUserLocation(location.country_name);

        // Get service data from local pricing service
        if (serviceId) {
          const serviceData = PricingService.getService(serviceId);
          
          if (!serviceData) {
            console.error('Service not found:', serviceId);
            setLoading(false);
            return;
          }

          // Transform pricing service data to match expected format
          const transformedService: Service = {
            id: serviceId,
            name: serviceData.name,
            description: serviceData.description,
            category: 'IT Services',
            pricing: {
              basic: serviceData.tiers.basic?.price || 0,
              standard: serviceData.tiers.standard?.price || 0,
              enterprise: serviceData.tiers.enterprise?.price || 0
            },
            features: {
              basic: serviceData.tiers.basic?.features || [],
              standard: serviceData.tiers.standard?.features || [],
              enterprise: serviceData.tiers.enterprise?.features || []
            }
          };

          setService(transformedService);
          console.log('Service loaded:', transformedService);

          // Convert pricing to user's currency
          if (currency !== 'USD') {
            const conversions = await Promise.all([
              convertCurrency(transformedService.pricing.basic, 'USD', currency),
              transformedService.pricing.standard ? convertCurrency(transformedService.pricing.standard, 'USD', currency) : 0,
              transformedService.pricing.enterprise ? convertCurrency(transformedService.pricing.enterprise, 'USD', currency) : 0
            ]);

            setConvertedPricing({
              basic: conversions[0],
              standard: conversions[1],
              enterprise: conversions[2]
            });

            // Convert add-on prices
            const convertedAddOnsList = await Promise.all(
              addOns.map(async (addOn) => ({
                ...addOn,
                price: await convertCurrency(addOn.price, 'USD', currency)
              }))
            );
            setConvertedAddOns(convertedAddOnsList);
          } else {
            setConvertedPricing(transformedService.pricing);
            setConvertedAddOns(addOns);
          }
          
          console.log('Pricing converted:', currency === 'USD' ? transformedService.pricing : convertedPricing);
        }
      } catch (error) {
        console.error('Error initializing page:', error);
      } finally {
        setLoading(false);
      }
    };

    initializePage();
  }, [serviceId]);

  const getCurrentPrice = () => {
    if (!service) return 0;
    const pricing = userCurrency === 'USD' ? service.pricing : convertedPricing;
    return pricing[selectedPackage] || 0;
  };

  const getAddOnPrice = (addOnId: string) => {
    const addOn = convertedAddOns.find(a => a.id === addOnId);
    return addOn ? addOn.price : 0;
  };

  const getTotalAddOnPrice = () => {
    return selectedAddOns.reduce((total, addOnId) => {
      return total + getAddOnPrice(addOnId);
    }, 0);
  };

  const getTotalPrice = () => {
    const basePrice = getCurrentPrice() * quantity;
    const addOnPrice = getTotalAddOnPrice() * quantity;
    return basePrice + addOnPrice;
  };

  const handleAddOnToggle = (addOnId: string) => {
    setSelectedAddOns(prev => 
      prev.includes(addOnId) 
        ? prev.filter(id => id !== addOnId)
        : [...prev, addOnId]
    );
  };

  const handlePurchase = async () => {
    if (!user || !service) {
      navigate('/client/login');
      return;
    }

    try {
      setIsLoading(true);
      const totalPrice = getTotalPrice();
      
      // Create payment intent using PaymentService
      const paymentIntent = await PaymentService.createPaymentIntent(
        service.id,
        selectedPackage,
        totalPrice,
        userCurrency,
        quantity,
        selectedAddOns
      );

      // Redirect to Zoho payment page
      if (paymentIntent.payment_url) {
        window.location.href = paymentIntent.payment_url;
      } else {
        // Fallback to success page if no payment URL
        navigate(`/payment-success?order_id=${paymentIntent.invoice_id}&amount=${totalPrice}`);
      }
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Failed to create payment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 pt-20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading service details...</p>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-gray-900 pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Service Not Found</h1>
          <p className="text-gray-400 mb-8">The requested service could not be found.</p>
          <Link 
            to="/client/services"
            className="bg-cyan-500 hover:bg-cyan-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Back to Services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 pt-20">
      {/* Back Navigation */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link 
          to="/client/services"
          className="inline-flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 transition-colors duration-300"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Back to Services</span>
        </Link>
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Service Details */}
          <div>
            <h1 className="text-4xl font-bold text-white mb-6">{service.name}</h1>
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">{service.description}</p>

            {/* Location Detection */}
            {userLocation && (
              <div className="bg-gray-800/50 rounded-xl p-4 mb-8 border border-gray-700">
                <div className="flex items-center text-sm text-gray-400">
                  <Shield className="w-4 h-4 mr-2" />
                  <span>Showing prices for {userLocation} in {userCurrency}</span>
                </div>
              </div>
            )}

            {/* Package Selection */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-white mb-6">Choose Your Package</h2>
              <div className="space-y-4">
                {Object.entries(service.pricing).map(([packageType, price]) => {
                  if (!price || price === 0) return null;
                  
                  const convertedPrice = userCurrency === 'USD' ? price : convertedPricing[packageType];
                  const isSelected = selectedPackage === packageType;
                  const features = service.features[packageType as keyof typeof service.features] || [];
                  
                  return (
                    <div
                      key={packageType}
                      onClick={() => setSelectedPackage(packageType as any)}
                      className={`border-2 rounded-xl p-6 cursor-pointer transition-all duration-300 ${
                        isSelected
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-semibold text-white capitalize">{packageType}</h3>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-cyan-400">
                            {formatCurrency(convertedPrice, userCurrency)}
                          </div>
                          {userCurrency !== 'USD' && (
                            <div className="text-sm text-gray-400">
                              ${price} USD
                            </div>
                          )}
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {features.map((feature, index) => (
                          <li key={index} className="flex items-center text-gray-300">
                            <Check className="w-4 h-4 mr-3 text-green-400 flex-shrink-0" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Features */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-semibold text-white mb-4">What's Included</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <Shield className="w-5 h-5 mr-3 text-cyan-400" />
                  <span className="text-gray-300">Enterprise Security</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-5 h-5 mr-3 text-green-400" />
                  <span className="text-gray-300">24/7 Support</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-5 h-5 mr-3 text-purple-400" />
                  <span className="text-gray-300">Expert Team</span>
                </div>
                <div className="flex items-center">
                  <Star className="w-5 h-5 mr-3 text-yellow-400" />
                  <span className="text-gray-300">Premium Quality</span>
                </div>
              </div>
            </div>
          </div>

          {/* Order Configuration */}
          <div>
            <div className="bg-gray-800/50 rounded-xl p-6 sticky top-8 border border-gray-700">
              <h2 className="text-2xl font-semibold text-white mb-6">Configure Your Order</h2>

              {/* Quantity Selection - Only show for services that support multiple units */}
              {['email-migration', 'data-migration', 'per-incident-support'].includes(serviceId || '') && (
                <div className="mb-6">
                  <QuantitySelector
                    label={
                      serviceId === 'email-migration' ? 'Number of Mailboxes' :
                      serviceId === 'data-migration' ? 'Number of Users' :
                      'Number of Incidents'
                    }
                    quantity={quantity}
                    onQuantityChange={setQuantity}
                    unitPrice={getCurrentPrice()}
                    currency={userCurrency}
                    min={1}
                    max={serviceId === 'email-migration' ? 1000 : serviceId === 'data-migration' ? 500 : 10}
                  />
                </div>
              )}

              {/* Add-ons */}
              <div className="mb-6">
                <AddOnSelector
                  addOns={convertedAddOns}
                  selectedAddOns={selectedAddOns}
                  onAddOnToggle={handleAddOnToggle}
                  currency={userCurrency}
                />
              </div>

              {/* Order Summary */}
              <div className="border-t border-gray-700 pt-6">
                <h3 className="text-xl font-semibold text-white mb-4">Order Summary</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Service:</span>
                    <span className="text-white">{service.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Package:</span>
                    <span className="text-white capitalize">{selectedPackage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Base Price:</span>
                    <span className="text-white">{formatCurrency(getCurrentPrice(), userCurrency)}</span>
                  </div>
                  {quantity > 1 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Quantity:</span>
                      <span className="text-white">{quantity}</span>
                    </div>
                  )}
                  {selectedAddOns.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Add-ons:</span>
                      <span className="text-white">{formatCurrency(getTotalAddOnPrice(), userCurrency)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-700 pt-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold text-white">Total:</span>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-cyan-400">
                        {formatCurrency(getTotalPrice(), userCurrency)}
                      </div>
                      {userCurrency !== 'USD' && (
                        <div className="text-sm text-gray-400">
                          (Approx. ${(getTotalPrice() / (userCurrency === 'INR' ? 83.25 : userCurrency === 'AUD' ? 1.52 : 1)).toFixed(2)} USD)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePurchase}
                  disabled={!user || isLoading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 disabled:transform-none"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Processing...</span>
                    </div>
                  ) : user ? (
                    'Proceed to Payment'
                  ) : (
                    'Login to Purchase'
                  )}
                </button>

                {!user && (
                  <p className="text-center text-gray-400 mt-4 text-sm">
                    <Link
                      to="/client/login"
                      className="text-cyan-400 hover:text-cyan-300 underline"
                    >
                      Sign in
                    </Link>
                    {' or '}
                    <Link
                      to="/client/register"
                      className="text-cyan-400 hover:text-cyan-300 underline"
                    >
                      create an account
                    </Link>
                    {' to continue'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}