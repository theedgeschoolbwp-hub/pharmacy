export const generateWhatsAppLink = (mobile, message) => {
  const cleanMobile = mobile.replace(/\D/g, '');
  // Format should be 923... or similar depending on region, 
  // but for common usage, prepending '92' (Pakistan) if it starts with '03'
  let formattedMobile = cleanMobile;
  if (cleanMobile.startsWith('0')) {
    formattedMobile = '92' + cleanMobile.substring(1);
  } else if (!cleanMobile.startsWith('92')) {
    formattedMobile = '92' + cleanMobile;
  }
  
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedMobile}?text=${encodedMessage}`;
};

const replaceVariables = (template, data) => {
  let result = template;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  });
  return result;
};

export const formatOrderReadyMessage = (customerName, orderId, template) => {
  const defaultTemplate = `Salaam {customer}! Your order #{orderId} is ready at the shop. You can visit anytime for trial and pickup. JazakAllah!`;
  return replaceVariables(template || defaultTemplate, {
    customer: customerName,
    orderId: orderId.toUpperCase()
  });
};

export const formatOrderConfirmationMessage = (customerName, orderId, deliveryDate, totalPrice, template) => {
  const defaultTemplate = `Salaam {customer}! Your order #{orderId} has been booked. Expected delivery: {deliveryDate}. Amount: ₨ {totalPrice}. JazakAllah!`;
  const date = new Date(deliveryDate).toLocaleDateString();
  return replaceVariables(template || defaultTemplate, {
    customer: customerName,
    orderId: orderId.toUpperCase(),
    deliveryDate: date,
    totalPrice: totalPrice
  });
};
