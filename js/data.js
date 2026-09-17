export const VEHICLES = {
  sedan: { name: 'Sedan', ratePerKm: 14, capacity: 4, luggage: '2 bags', idealFor: 'Comfortable everyday travel', icon: '🚘' },
  suv: { name: 'SUV', ratePerKm: 18, capacity: 6, luggage: '4 bags', idealFor: 'Families and group travel', icon: '🚙' },
  premium: { name: 'Premium', ratePerKm: 25, capacity: 4, luggage: '3 bags', idealFor: 'Premium business and leisure travel', icon: '✨' }
};
export const DESTINATIONS = [
  { name: 'Airport Transfers', description: 'Plan a comfortable pickup or drop with your trip details in one place.', icon: '✈' },
  { name: 'Outstation Journeys', description: 'Choose a vehicle that suits your group for travel beyond the city.', icon: '⌁' },
  { name: 'Business Travel', description: 'A clear booking record and estimated fare for scheduled work trips.', icon: '▣' }
];
export const formatINR = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
export const humanizeStatus = status => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
