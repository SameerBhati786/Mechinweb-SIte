import React from 'react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { 
  Mail, 
  Shield, 
  Lock, 
  Cloud, 
  Database, 
  Server,
  Wrench,
  ArrowRight,
  CheckCircle,
  Globe
} from 'lucide-react';
import { getPreferredCurrency, formatCurrency, detectUserLocation, convertCurrency } from '../utils/currency';

const Services: React.FC = () => {
  const [userCurrency, setUserCurrency] = useState('USD');
  const [userLocation, setUserLocation] = useState('');
  const [convertedPrices, setConvertedPrices] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeCurrency = async () => {
      try {
        setLoading(true);
        console.log('Initializing currency for Services component...');
        const [preferredCurrency, location] = await Promise.all([
          getPreferredCurrency(),
          detectUserLocation()
        ]);
        
        console.log('Detected currency:', preferredCurrency, 'Location:', location.country_name);
        
        setUserCurrency(preferredCurrency);
        setUserLocation(location.country_name);
        
        // Base USD prices for all services
        const basePrices = {
          'email-migration': 4,
          'email-deliverability': 25,
          'ssl-setup': 7,
          'cloud-management': 25,
          'data-migration': 5,
          'hosting-support': 15,
          'acronis-setup': 25,
          'per-incident-support': 20
        };
        
        // Convert all prices to user's currency
        const converted: {[key: string]: number} = {};
        for (const [serviceId, usdPrice] of Object.entries(basePrices)) {
          const convertedPrice = preferredCurrency === 'USD' 
            ? usdPrice 
            : await convertCurrency(usdPrice, 'USD', preferredCurrency);
          converted[serviceId] = convertedPrice;
          console.log(`Services: ${serviceId} $${usdPrice} USD = ${formatCurrency(convertedPrice, preferredCurrency)}`);
        }
        
        setConvertedPrices(converted);
      } catch (error) {
        console.error('Error initializing currency:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeCurrency();
  }, []);

  const services = [
    {
      icon: Mail,
      title: 'Email Migration & Setup',
      description: 'Seamless email migration between platforms with zero downtime and complete data integrity.',
      features: ['Zero downtime migration', 'Complete data backup', '24/7 support'],
      link: '/services/email-migration',
      gradient: 'from-blue-500 to-cyan-500',
      priceKey: 'email-migration'
    },
    {
      icon: Shield,
      title: 'Email Deliverability',
      description: 'Complete DNS and email authentication setup including SPF, DKIM, and DMARC configuration.',
      features: ['SPF/DKIM/DMARC setup', 'DNS troubleshooting', 'Deliverability optimization'],
      link: '/services/email-deliverability',
      gradient: 'from-green-500 to-emerald-500',
      priceKey: 'email-deliverability'
    },
    {
      icon: Lock,
      title: 'Secure SSL & HTTPS Setup',
      description: 'Professional SSL certificate installation, configuration, and automated renewal systems.',
      features: ['SSL installation', 'Auto-renewal setup', 'Security optimization'],
      link: '/services/ssl-setup',
      gradient: 'from-purple-500 to-pink-500',
      priceKey: 'ssl-setup'
    },
    {
      icon: Cloud,
      title: 'Cloud Productivity Suite Management',
      description: 'Expert administration and optimization of Google Workspace and Microsoft 365 environments.',
      features: ['Google Workspace setup', 'Microsoft 365 admin', 'User management'],
      link: '/services/cloud-management',
      gradient: 'from-orange-500 to-red-500',
      priceKey: 'cloud-management'
    },
    {
      icon: Database,
      title: 'Cloud Data Migration',
      description: 'Per drive/site/Teams chat migration between cloud platforms.',
      features: ['Per drive migration', 'Per site migration', 'Per Teams chat migration'],
      link: '/services/data-migration',
      gradient: 'from-indigo-500 to-purple-500',
      priceKey: 'data-migration'
    },
    {
      icon: Server,
      title: 'Hosting & Control Panel Support',
      description: 'Professional Plesk and cPanel troubleshooting, optimization, and ongoing maintenance.',
      features: ['Plesk optimization', 'cPanel troubleshooting', 'Performance tuning'],
      link: '/services/hosting-support',
      gradient: 'from-teal-500 to-cyan-500',
      priceKey: 'hosting-support'
    },
    {
      icon: Database,
      title: 'Acronis Account Setup (Data Backup & Recovery)',
      description: 'One-time Acronis backup solution setup and configuration for comprehensive data protection.',
      features: ['Account creation & setup', 'Complete configuration', 'Multi-device setup'],
      link: '/services/acronis-setup',
      gradient: 'from-blue-500 to-indigo-500',
      priceKey: 'acronis-setup'
    },
    {
      icon: Wrench,
      title: 'Per Incident Support',
      description: 'Quick resolution for specific IT issues across all platforms with expert troubleshooting.',
      features: ['Expert troubleshooting', 'Quick resolution', '7-day follow-up'],
      link: '/services/per-incident-support',
      gradient: 'from-orange-500 to-red-500',
      priceKey: 'per-incident-support'
    }
  ];

  return (
    <section id="services" className="py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden scroll-mt-20">
      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-purple-500/5"></div>
      <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          {/* Location indicator */}
          {userLocation && (
            <div className="inline-flex items-center space-x-2 bg-cyan-500/20 text-cyan-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Globe className="w-4 h-4" />
              <span>Showing prices for {userLocation} in {userCurrency}</span>
            </div>
          )}
          
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Our Professional
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent"> Services</span>
          </h2>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Comprehensive IT solutions designed to streamline your business operations and enhance your digital infrastructure.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => {
            const IconComponent = service.icon;
            return (
              <div
                key={index}
                className="group bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700/50 hover:border-cyan-500/50 transition-all duration-500 transform hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20"
              >
                <div className={`w-16 h-16 bg-gradient-to-r ${service.gradient} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <IconComponent className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-cyan-400 transition-colors duration-300">
                  {service.title}
                </h3>
                
                <p className="text-gray-300 mb-6 leading-relaxed">
                  {service.description}
                </p>
                
                {/* Pricing Display */}
                <div className="mb-6 p-4 bg-gray-700/30 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Starting from</span>
                    <div className="text-right">
                      {loading ? (
                        <div className="text-2xl font-bold text-cyan-400 animate-pulse">...</div>
                      ) : (
                        <div className="text-xs text-gray-400">
                          <div className="text-2xl font-bold text-cyan-400">
                            {service.priceKey && convertedPrices[service.priceKey] 
                              ? formatCurrency(convertedPrices[service.priceKey], userCurrency)
                              : 'Contact for pricing'
                            }
                          </div>
                          {userCurrency !== 'USD' && service.priceKey && convertedPrices[service.priceKey] && (
                            <div className="text-xs text-gray-400 mt-1">
                              ${service.priceKey === 'email-migration' ? 4 : 
                                service.priceKey === 'ssl-setup' ? 7 :
                                service.priceKey === 'data-migration' ? 5 :
                                service.priceKey === 'hosting-support' ? 15 :
                                service.priceKey === 'per-incident-support' ? 20 :
                                25} USD
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-8">
                  {service.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center text-gray-400">
                      <CheckCircle className="w-4 h-4 text-green-400 mr-2 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to={service.link}
                  className="inline-flex items-center text-cyan-400 hover:text-cyan-300 font-semibold group-hover:translate-x-2 transition-all duration-300"
                >
                  Learn More
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-cyan-500/20 max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-white mb-4">
              Need a Custom Solution?
            </h3>
            <p className="text-gray-300 mb-6">
              We offer tailored IT solutions to meet your specific business requirements. 
              Contact us for a personalized consultation and custom pricing.
            </p>
            <Link
              to="/#contact"
              className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold rounded-lg hover:from-cyan-600 hover:to-purple-700 transition-all duration-300 transform hover:scale-105"
            >
              Get Custom Quote
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Services;