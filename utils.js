
// adress k different parts ko mila k aik complete adress bnata hai
function joinAddress(street, area, city) {
  const parts = [];
  if (street) parts.push(street);
  if (area && !(street && String(street).includes(area))) parts.push(area);
  if (city) parts.push(city);
  return parts.join(', ');
}
module.exports = { joinAddress };
