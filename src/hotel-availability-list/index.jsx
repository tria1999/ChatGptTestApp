import React from "react";
import { createRoot } from "react-dom/client";
import { useOpenAiGlobal } from "../use-openai-global";

// Mock data for browser testing - will be overridden by MCP server data
const mockData = {
  hotelData: {
    data: {
      name: "Demo Hotel",
      code: "DEMO",
      currency: "EUR",
      rates: [
        { id: 1, room: "Standard Double Room", rate: "Best Available Rate", board: 1, status: "AVL", pricing: { price: 120, discount: 0 }, remaining: 3 },
        { id: 2, room: "Superior Suite", rate: "Non-Refundable", board: 0, status: "AVL", pricing: { price: 180, discount: 20 }, remaining: 1 },
        { id: 3, room: "Deluxe Room", rate: "Flexible Rate", board: 19, status: "AVL", pricing: { price: 150, discount: 0 }, remaining: 5 },
      ],
    },
  },
  searchParams: { checkin: "2026-02-10", checkout: "2026-02-12", adults: 2 },
};

function App() {
  const widgetState = useOpenAiGlobal("widgetState");
  
  // Use mock data if no real data is available (for browser testing)
  const data = widgetState || mockData;
  const hotelData = data?.hotelData?.data || null;
  const searchParams = data?.searchParams || {};
  const rates = hotelData?.rates || [];

  const formatCurrency = (amount, currency) => {
    if (!amount) return "–";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "EUR",
    }).format(amount);
  };

  const getBoardTypeName = (boardId) => {
    const boardTypes = {
      0: "Room Only",
      1: "B&B",
      2: "Half Board",
      3: "Full Board",
      4: "All Inclusive",
      19: "Continental",
    };
    return boardTypes[boardId] || "";
  };

  return (
    <div className="antialiased w-full text-black px-4 pb-2 border border-black/10 rounded-2xl sm:rounded-3xl overflow-hidden bg-white">
      <div className="max-w-full">
        {/* Header */}
        <div className="flex flex-row items-center gap-4 border-b border-black/5 py-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white text-xl font-bold">
            🏨
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-base sm:text-xl font-medium truncate">
              {hotelData?.name || "Hotel Availability"}
            </div>
            <div className="text-sm text-black/60">
              {searchParams.checkin} → {searchParams.checkout} · {searchParams.adults || 2} guests
            </div>
          </div>
        </div>

        {/* Rates List - Text Only */}
        <div className="min-w-full text-sm flex flex-col">
          {rates.length > 0 ? (
            rates.map((rate, i) => (
              <div
                key={rate.id || i}
                className="px-2 -mx-2 rounded-xl hover:bg-black/5"
              >
                <div
                  style={{
                    borderBottom: i === rates.length - 1 ? "none" : "1px solid rgba(0, 0, 0, 0.05)",
                  }}
                  className="flex w-full items-center gap-3 py-3"
                >
                  {/* Index */}
                  <div className="w-6 text-center text-sm text-black/40 font-medium">
                    {i + 1}
                  </div>

                  {/* Room & Rate Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {rate.room || "Room"}
                    </div>
                    <div className="text-xs text-black/60 flex items-center gap-2 mt-0.5">
                      <span>{rate.rate || "Standard Rate"}</span>
                      {getBoardTypeName(rate.board) && (
                        <>
                          <span>·</span>
                          <span>{getBoardTypeName(rate.board)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status & Availability */}
                  <div className="text-right flex-shrink-0">
                    {rate.status === "AVL" ? (
                      <span className="text-green-600 text-xs font-medium">Available</span>
                    ) : (
                      <span className="text-red-600 text-xs font-medium">{rate.status || "N/A"}</span>
                    )}
                    {rate.remaining > 0 && rate.remaining <= 5 && (
                      <div className="text-xs text-orange-500">{rate.remaining} left</div>
                    )}
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0 min-w-[80px]">
                    <div className="font-semibold text-blue-600">
                      {formatCurrency(rate.pricing?.price, hotelData?.currency)}
                    </div>
                    {rate.pricing?.discount > 0 && (
                      <div className="text-xs text-green-600">
                        Save {formatCurrency(rate.pricing.discount, hotelData?.currency)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-black/60">
              No rates available for the selected dates.
            </div>
          )}
        </div>

        {/* Summary Footer */}
        {rates.length > 0 && (
          <div className="border-t border-black/5 pt-3 pb-1 text-xs text-black/50 text-center">
            {rates.length} rate{rates.length !== 1 ? "s" : ""} found
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("hotel-availability-list-root")).render(<App />);
