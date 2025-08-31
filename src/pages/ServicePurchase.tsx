import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Shield, Clock, Users, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { convertCurrency, formatCurrency, getPreferredCurrency, detectUserLocation } from '../utils/currency';
import { PricingService } from '../lib/pricing';
import QuantitySelector from '../components/QuantitySelector';
import AddOnSelector from '../components/AddOnSelector';

interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  pricing: {
    basic: number;
    standard: number;
    enterprise: number;
  };
  features: {
    basic: string[];
    standard: string[];
    enterprise: string[];
  };
}

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
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
  const [userCurrency, setUserCurrency] = useState('USD');
  const [userLocation, setUserLocation] = useState('');
  const [convertedPricing, setConvertedPricing] = useState<any>({});
  const [convertedAddOns, setConvertedAddOns] = useState<AddOn[]>([]);

  const addOns: AddOn[] = [
    { id: 'priority-support', name: 'Priority Support', description: '24/7 priority technical support', price: 10 },
    { id: 'backup-service', name: 'Backup Service', description: 'Daily automated backups', price: 5 },
    { id: 'ssl-certificate', name: 'SSL Certificate', description: 'Premium SSL certificate included', price: 15 },
    { id: 'monitoring', name: 'Monitoring', description: 'Real-time performance monitoring', price: 8 }
  ];

  useEffect(() => {
    const initializePage = async () => {
      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      // Detect user currency and location
      const currency = await getPreferredCurrency();
      const location = await detectUserLocation();
      setUserCurrency(currency);
      setUserLocation(location);

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
            convertCurrency(transformedService.pricing.standard, 'USD', currency),
            convertCurrency(transformedService.pricing.enterprise, 'USD', currency)
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
      setLoading(false);
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

  const handlePurchase = async () => {
    if (!user || !service) return;

    try {
      setIsLoading(true);
      const totalPrice = getTotalPrice();
      const basePrice = getCurrentPrice();
      
      // Convert back to USD for storage if needed
      const usdPrice = userCurrency === 'USD' ? totalPrice : await convertCurrency(totalPrice, userCurrency, 'USD');
      const usdBasePrice = userCurrency === 'USD' ? basePrice : await convertCurrency(basePrice, userCurrency, 'USD');

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          client_id: user.id,
          service_id: service.id,
          package_type: selectedPackage,
          amount_usd: usdPrice,
          amount_inr: userCurrency === 'INR' ? totalPrice : await convertCurrency(usdPrice, 'USD', 'INR'),
          amount_aud: userCurrency === 'AUD' ? totalPrice : await convertCurrency(usdPrice, 'USD', 'AUD'),
          currency: userCurrency,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/payment/${order.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Service not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-blue-400 hover:text-blue-300 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Services
        </button>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Service Details */}
          <div>
            <h1 className="text-4xl font-bold mb-6">{service.name}</h1>
            <p className="text-gray-300 text-lg mb-8">{service.description}</p>

            {/* Location Detection */}
            {userLocation && (
              <div className="bg-gray-800 rounded-lg p-4 mb-8">
                <div className="flex items-center text-sm text-gray-400">
                  <Shield className="w-4 h-4 mr-2" />
                  Auto-detected: {userLocation}
                </div>
              </div>
            )}

            {/* Package Selection */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-6">Choose Your Package</h2>
              <div className="space-y-4">
                {Object.entries(service.pricing).map(([packageType, price]) => {
                  const convertedPrice = userCurrency === 'USD' ? price : convertedPricing[packageType];
                  const isSelected = selectedPackage === packageType;
                  
                  return (
                    <div
                      key={packageType}
                      onClick={() => setSelectedPackage(packageType as any)}
                      className={`border-2 rounded-lg p-6 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-semibold capitalize">{packageType}</h3>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-400">
                            {formatCurrency(convertedPrice, userCurrency)}/unit
                          </div>
                          {userCurrency !== 'USD' && (
                            <div className="text-sm text-gray-400">
                              (${price} USD)
                            </div>
                          )}
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {service.features[packageType as keyof typeof service.features]?.map((feature, index) => (
                          <li key={index} className="flex items-center text-gray-300">
                            <Check className="w-4 h-4 mr-3 text-green-400 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Features */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-4">What's Included</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <Shield className="w-5 h-5 mr-3 text-blue-400" />
                  <span>Enterprise Security</span>
                </div>
                <div className="flex items-center">
                  <Clock className="w-5 h-5 mr-3 text-green-400" />
                  <span>24/7 Support</span>
                </div>
                <div className="flex items-center">
                  <Users className="w-5 h-5 mr-3 text-purple-400" />
                  <span>Expert Team</span>
                </div>
                <div className="flex items-center">
                  <Star className="w-5 h-5 mr-3 text-yellow-400" />
                  <span>Premium Quality</span>
                </div>
              </div>
            </div>
          </div>

          {/* Order Configuration */}
          <div>
            <div className="bg-gray-800 rounded-lg p-6 sticky top-8">
              <h2 className="text-2xl font-semibold mb-6">Configure Your Order</h2>

              {/* Quantity Selection */}
              <div className="mb-6">
                <QuantitySelector
                  quantity={quantity}
                  onQuantityChange={setQuantity}
                  unitPrice={getCurrentPrice()}
                  currency={userCurrency}
                  label="Number of Units"
                />
              </div>

              {/* Add-ons */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Add-On Services</h3>
                <AddOnSelector
                  addOns={convertedAddOns}
                  selectedAddOns={selectedAddOns}
                  onAddOnChange={setSelectedAddOns}
                  currency={userCurrency}
                />
              </div>

              {/* Order Summary */}
              <div className="border-t border-gray-700 pt-6">
                <h3 className="text-xl font-semibold mb-4">Order Summary</h3>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span>Service:</span>
                    <span>{service.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Package:</span>
                    <span className="capitalize">{selectedPackage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Base Price:</span>
                    <span>{formatCurrency(getCurrentPrice(), userCurrency)}</span>
                  </div>
                  {quantity > 1 && (
                    <div className="flex justify-between">
                      <span>Quantity:</span>
                      <span>{quantity}</span>
                    </div>
                  )}
                  {selectedAddOns.length > 0 && (
                    <div className="flex justify-between">
                      <span>Add-ons:</span>
                      <span>{formatCurrency(getTotalAddOnPrice(), userCurrency)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-700 pt-4 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-semibold">Total:</span>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-400">
                        {formatCurrency(getTotalPrice(), userCurrency)}
                      </div>
                      {userCurrency !== 'USD' && (
                        <div className="text-sm text-gray-400">
                          (${(getTotalPrice() / (userCurrency === 'INR' ? 83.25 : userCurrency === 'AUD' ? 1.52 : 1)).toFixed(2)} USD)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePurchase}
                  disabled={!user}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {user ? 'Proceed to Payment' : 'Login to Purchase'}
                </button>

                {!user && (
                  <p className="text-center text-gray-400 mt-4">
                    <button
                      onClick={() => navigate('/client/login')}
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Sign in
                    </button>
                    {' or '}
                    <button
                      onClick={() => navigate('/client/register')}
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      create an account
                    </button>
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