import React from 'react';
import { useState, useEffect } from 'react';
import { CheckCircle, Plus } from 'lucide-react';
import { convertCurrency, formatCurrency } from '../utils/currency';

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  recommended?: boolean;
}

interface AddOnSelectorProps {
  addOns: AddOn[];
  selectedAddOns: string[];
  onAddOnToggle: (addOnId: string) => void;
  currency: string;
}

const AddOnSelector: React.FC<AddOnSelectorProps> = ({
  addOns,
  selectedAddOns,
  onAddOnToggle,
  currency
}) => {
  const [convertedPrices, setConvertedPrices] = useState<{[key: string]: number}>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const convertAddOnPrices = async () => {
      try {
        const converted: {[key: string]: number} = {};
        
        for (const addOn of addOns) {
          const convertedPrice = await convertCurrency(addOn.price, 'USD', currency);
          converted[addOn.id] = convertedPrice;
        }
        
        setConvertedPrices(converted);
      } catch (error) {
        console.error('Error converting add-on prices:', error);
        // Fallback to original prices
        const fallback: {[key: string]: number} = {};
        addOns.forEach(addOn => {
          fallback[addOn.id] = addOn.price;
        });
        setConvertedPrices(fallback);
      } finally {
        setLoading(false);
      }
    };
    
    convertAddOnPrices();
  }, [addOns, currency]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Add-On Services</h3>
      
      {addOns.map((addOn) => {
        const isSelected = selectedAddOns.includes(addOn.id);
        
        return (
          <div
            key={addOn.id}
            className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
              isSelected
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-gray-600 bg-gray-700/30 hover:border-gray-500'
            }`}
            onClick={() => onAddOnToggle(addOn.id)}
          >
            {addOn.recommended && (
              <div className="absolute -top-2 left-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-3 py-1 rounded-full text-xs font-bold">
                RECOMMENDED
              </div>
            )}
            
            <div className="flex items-start space-x-4">
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-500'
                  : 'border-gray-400'
              }`}>
                {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
              </div>
              
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-white font-semibold">{addOn.name}</h4>
                  {loading ? (
                    <span className="text-cyan-400 font-bold animate-pulse">...</span>
                  ) : (
                    <div className="text-right">
                      <span className="text-cyan-400 font-bold">
                        +{formatCurrency(convertedPrices[addOn.id] || addOn.price, currency)}
                      </span>
                      {currency !== 'USD' && (
                        <div className="text-xs text-gray-400">
                          +${addOn.price} USD
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-gray-400 text-sm">{addOn.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AddOnSelector;