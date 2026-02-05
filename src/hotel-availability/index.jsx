import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useOpenAiGlobal } from "../use-openai-global";
import { useMaxHeight } from "../use-max-height";
import { Calendar, Users, Bed, MapPin, AlertCircle } from "lucide-react";
import { Button } from "@openai/apps-sdk-ui/components/Button";

export default function HotelAvailability() {
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useMaxHeight() ?? undefined;
  const widgetState = useOpenAiGlobal("widgetState");
  
  const hotelData = widgetState?.hotelData || null;
  const propertyCode = widgetState?.propertyCode || "DEMO";
  const searchParams = widgetState?.searchParams || {};

  const [selectedRate, setSelectedRate] = useState(null);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { 
      weekday: "short", 
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };

  const formatCurrency = (amount, currency) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount);
  };

  const getBoardTypeName = (boardId) => {
    const boardTypes = {
      0: "Room Only",
      1: "Bed & Breakfast",
      2: "Half Board",
      3: "Full Board",
      4: "All Inclusive",
      19: "Continental Breakfast",
    };
    return boardTypes[boardId] || "Not specified";
  };

  if (!hotelData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center p-8">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hotel availability data available</p>
        </div>
      </div>
    );
  }

  const { data } = hotelData;

  return (
    <div 
      className="bg-gray-50 overflow-y-auto"
      style={{ maxHeight }}
    >
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{data.name}</h1>
              <p className="text-blue-100 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Property Code: {data.code}
              </p>
            </div>
            {data.url?.photo && (
              <img 
                src={data.url.photoM || data.url.photo} 
                alt={data.name}
                className="w-32 h-24 object-cover rounded-lg shadow-lg"
              />
            )}
          </div>

          {/* Search Parameters */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <div>
                <p className="text-xs text-blue-200">Check-in</p>
                <p className="font-semibold">{formatDate(searchParams.checkin)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <div>
                <p className="text-xs text-blue-200">Check-out</p>
                <p className="font-semibold">{formatDate(searchParams.checkout)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <div>
                <p className="text-xs text-blue-200">Guests</p>
                <p className="font-semibold">{searchParams.adults || 2} Adults</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Bed className="w-5 h-5" />
              <div>
                <p className="text-xs text-blue-200">Rooms</p>
                <p className="font-semibold">{searchParams.rooms || 1} Room(s)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Rates Section */}
      <div className="max-w-6xl mx-auto p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Available Rates ({data.rates?.length || 0})
        </h2>

        {data.rates && data.rates.length > 0 ? (
          <div className="space-y-4">
            {data.rates.map((rate) => (
              <div 
                key={rate.id}
                className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden ${
                  rate.status !== "AVL" ? "opacity-60" : ""
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-800">{rate.room}</h3>
                        {rate.status === "AVL" && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                            Available
                          </span>
                        )}
                        {rate.status !== "AVL" && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                            {rate.status_descr}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 font-medium mb-2">{rate.rate}</p>
                      {rate.rate_desc && (
                        <p className="text-sm text-gray-500">{rate.rate_desc}</p>
                      )}
                      
                      {/* Board Type */}
                      {rate.board !== undefined && (
                        <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                          <Bed className="w-4 h-4" />
                          <span>{getBoardTypeName(rate.board)}</span>
                        </div>
                      )}

                      {/* Remaining Rooms */}
                      {rate.remaining > 0 && (
                        <p className="mt-2 text-sm text-orange-600 font-medium">
                          Only {rate.remaining} room(s) left!
                        </p>
                      )}
                    </div>

                    {/* Pricing */}
                    <div className="text-right ml-4">
                      {rate.pricing?.discount > 0 && (
                        <p className="text-sm text-gray-400 line-through">
                          {formatCurrency(rate.pricing.stay + rate.pricing.discount, data.currency)}
                        </p>
                      )}
                      <p className="text-3xl font-bold text-blue-600">
                        {formatCurrency(rate.pricing?.price, data.currency)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Total for {searchParams.nights || 1} night(s)
                      </p>
                      {rate.pricing?.discount > 0 && (
                        <p className="text-sm text-green-600 font-semibold mt-1">
                          Save {formatCurrency(rate.pricing.discount, data.currency)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Rate Photo */}
                  {rate.url?.photoM && (
                    <div className="mb-4">
                      <img 
                        src={rate.url.photoM} 
                        alt={rate.room}
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {/* Labels */}
                  {rate.labels && rate.labels.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {rate.labels.map((label, idx) => (
                        <span 
                          key={idx}
                          className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full"
                        >
                          {label.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expandable Details */}
                  {selectedRate === rate.id ? (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      {/* Payment Policy */}
                      {rate.payment_policy && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-800 mb-2">Payment Policy</h4>
                          <div 
                            className="text-sm text-gray-600"
                            dangerouslySetInnerHTML={{ __html: rate.payment_policy }}
                          />
                        </div>
                      )}

                      {/* Cancellation Policy */}
                      {rate.cancellation_policy && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-800 mb-2">Cancellation Policy</h4>
                          <div 
                            className="text-sm text-gray-600"
                            dangerouslySetInnerHTML={{ __html: rate.cancellation_policy }}
                          />
                        </div>
                      )}

                      {/* Price Breakdown by Day */}
                      {rate.days && rate.days.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-800 mb-2">Daily Breakdown</h4>
                          <div className="space-y-2">
                            {rate.days.map((day, idx) => (
                              <div 
                                key={idx}
                                className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded"
                              >
                                <span className="text-gray-700">
                                  {formatDate(day.date)}
                                  {day.min_stay > 1 && (
                                    <span className="ml-2 text-xs text-gray-500">
                                      (Min stay: {day.min_stay} nights)
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold text-gray-800">
                                  {formatCurrency(day.price, data.currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={() => setSelectedRate(null)}
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                      >
                        Hide Details
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setSelectedRate(rate.id)}
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                    >
                      View Details
                    </Button>
                  )}

                  {/* Book Now Button */}
                  {rate.status === "AVL" && rate.url?.engine && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <a 
                        href={rate.url.engine}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block w-full"
                      >
                        <Button 
                          variant="primary"
                          className="w-full"
                        >
                          Book Now
                        </Button>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              No Rates Available
            </h3>
            <p className="text-gray-500">
              There are no rates available for the selected dates and criteria.
            </p>
          </div>
        )}
      </div>

      {/* Footer with Hotel Links */}
      {data.url?.website && (
        <div className="max-w-6xl mx-auto px-6 pb-6">
          <div className="bg-white rounded-lg shadow-md p-4 text-center">
            <a 
              href={data.url.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Visit Hotel Website →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

if (typeof document !== "undefined") {
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<HotelAvailability />);
  }
}
