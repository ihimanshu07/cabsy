export const VEHICLES = {
  sedan: { name: 'Prime Sedan', fare: 850, capacity: 4, luggage: '2 bags', idealFor: 'Comfortable solo, couple, and small-family travel', icon: '🚘' },
  ertiga: { name: 'Ertiga', fare: 1250, capacity: 6, luggage: '3 bags', idealFor: 'Families and small groups', icon: '🚐' },
  innova: { name: 'Innova Crysta', fare: 1550, capacity: 6, luggage: '4 bags', idealFor: 'Premium family and business travel', icon: '🚙' },
  urbania: { name: 'Urbania', fare: 4000, capacity: 16, luggage: '8 bags', idealFor: 'Large groups and events', icon: '🚌' },
  tempo: { name: 'Tempo Traveller', fare: 4000, capacity: 12, luggage: '7 bags', idealFor: 'Group and outstation travel', icon: '🚐' }
};

export const DESTINATIONS = [
  { name: 'Airport Transfers', description: 'Plan a comfortable pickup or drop with your trip details in one place.', icon: '✈' },
  { name: 'Outstation Journeys', description: 'Choose a vehicle that suits your group for travel beyond the city.', icon: '⌁' },
  { name: 'Business Travel', description: 'A clear booking record and estimated fare for scheduled work trips.', icon: '▣' }
];

export const formatINR = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
export const humanizeStatus = status => status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending';
