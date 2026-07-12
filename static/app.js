// ===== CONFIGURATION =====
const API_URL = ''; // Relative path because backend serves frontend
let PHONE = '917569047584'; // Default fallback WhatsApp phone number
let products = [];
let cart = [];

// ===== OTP STATE =====
let phoneVerified = false;
let otpCooldownTimer = null;
let otpCooldownSeconds = 0;
let verifiedPhone = ''; // Store the verified phone to detect changes
let selectedPaymentMethod = 'razorpay'; // 'razorpay' or 'cod'

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  if (products.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 40px;">No products available at the moment. Check back soon!</div>';
    return;
  }
  grid.innerHTML = products.map(p => {
    let stockHtml = '';
    let btnHtml = '';

    // Check if this product is already in the cart
    const cartItem = cart.find(c => c.id === p.id);

    if (p.stock_quantity <= 0) {
      stockHtml = `<div class="product-stock out-of-stock">❌ Out of Stock</div>`;
      btnHtml = `<button class="add-to-cart btn-out-of-stock" disabled>Out of Stock</button>`;
    } else if (p.stock_quantity < 10) {
      stockHtml = `<div class="product-stock low-stock">⚠️ Only ${p.stock_quantity} left!</div>`;
      if (cartItem) {
        btnHtml = `
          <div class="qty-control" style="margin-top:0;">
            <button class="qty-btn" onclick="changeQty(${p.id},-1)">−</button>
            <span class="qty-num">${cartItem.qty}</span>
            <button class="qty-btn" onclick="changeQty(${p.id},1)">+</button>
          </div>
        `;
      } else {
        btnHtml = `<button class="add-to-cart" onclick="addToCart(${p.id})">+ Add</button>`;
      }
    } else {
      stockHtml = `<div class="product-stock in-stock">✅ In Stock</div>`;
      if (cartItem) {
        btnHtml = `
          <div class="qty-control" style="margin-top:0;">
            <button class="qty-btn" onclick="changeQty(${p.id},-1)">−</button>
            <span class="qty-num">${cartItem.qty}</span>
            <button class="qty-btn" onclick="changeQty(${p.id},1)">+</button>
          </div>
        `;
      } else {
        btnHtml = `<button class="add-to-cart" onclick="addToCart(${p.id})">+ Add</button>`;
      }
    }

    return `
      <div class="product-card">
        <div class="product-img">
          ${p.emoji}
          <div class="product-badge">${p.badge || 'Fresh'}</div>
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-desc">${p.desc || ''}</div>
          ${stockHtml}
          <div class="product-footer">
            <div class="product-price">₹${p.price.toLocaleString('en-IN')} <span>/ ${p.unit}</span></div>
            ${btnHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  if (product.stock_quantity <= 0) {
    showToast('⚠️ This product is currently out of stock!');
    return;
  }
  const existing = cart.find(c => c.id === id);
  if (existing) {
    if (existing.qty >= product.stock_quantity) {
      showToast(`⚠️ Only ${product.stock_quantity} units available in stock!`);
      return;
    }
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  updateCart();
  showToast('Added to cart!');
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  updateCart();
}

function changeQty(id, delta) {
  const item = cart.find(c => c.id === id);
  if (!item) return;
  if (delta > 0) {
    const product = products.find(p => p.id === id);
    if (product && item.qty >= product.stock_quantity) {
      showToast(`⚠️ Only ${product.stock_quantity} units available in stock!`);
      return;
    }
  }
  item.qty += delta;
  if (item.qty <= 0) removeFromCart(id);
  else updateCart();
}

function updateCart() {
  const count = cart.reduce((s, c) => s + c.qty, 0);
  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = '₹' + total.toLocaleString('en-IN');
  const footer = document.getElementById('cartFooter');
  const itemsEl = document.getElementById('cartItems');
  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="cart-empty"><span class="emoji">🦀</span>Your cart is empty.<br>Add some crabs!</div>';
    if (footer) footer.style.display = 'none';
  } else {
    itemsEl.innerHTML = cart.map(c => `
      <div class="cart-item">
        <div class="cart-item-img">${c.emoji}</div>
        <div class="cart-item-info">
          <div class="cart-item-name">${c.name}</div>
          <div class="cart-item-price">₹${c.price.toLocaleString('en-IN')} / ${c.unit}</div>
          <div class="qty-control">
            <button class="qty-btn" onclick="changeQty(${c.id},-1)">−</button>
            <span class="qty-num">${c.qty}</span>
            <button class="qty-btn" onclick="changeQty(${c.id},1)">+</button>
          </div>
        </div>
        <button class="remove-btn" onclick="removeFromCart(${c.id})">✕</button>
      </div>
    `).join('');
    if (footer) footer.style.display = 'block';
  }
  renderProducts();
}

function openCart() {
  document.getElementById('cartPanel').classList.add('open');
  document.getElementById('overlay').classList.add('open');
}

function closeCart() {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('Cart is empty!');
    return;
  }

  // Reset OTP verification state for fresh checkout
  resetOtpState();
  const phoneInput = document.getElementById('co_phone');
  if (phoneInput) { phoneInput.readOnly = false; phoneInput.style.background = ''; }
  const sendBtn = document.getElementById('otpSendBtn');
  if (sendBtn) sendBtn.style.display = '';

  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const fee = Math.round(total * 0.02);
  const grand = total + fee;
  document.getElementById('co_summary').innerHTML = cart.map(c =>
    `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--sand);">
      <span>${c.emoji} ${c.name} × ${c.qty} ${c.unit}</span>
      <span style="font-weight:500;">₹${(c.qty * c.price).toLocaleString('en-IN')}</span>
    </div>`
  ).join('');
  document.getElementById('co_subtotal').textContent = '₹' + total.toLocaleString('en-IN');
  document.getElementById('co_fee').textContent = '₹' + fee.toLocaleString('en-IN');
  document.getElementById('co_total_final').textContent = '₹' + grand.toLocaleString('en-IN');
  document.getElementById('rzp_amount_label').textContent = '₹' + grand.toLocaleString('en-IN');

  // Calculate COD amounts
  const advance = Math.round(grand * 0.25);
  const balance = grand - advance;
  document.getElementById('codAdvanceAmount').textContent = '₹' + advance.toLocaleString('en-IN');
  document.getElementById('codBalanceAmount').textContent = '₹' + balance.toLocaleString('en-IN');
  document.getElementById('cod_amount_label').textContent = '₹' + advance.toLocaleString('en-IN');

  // Reset payment method to online
  selectPaymentMethod('razorpay');

  document.getElementById('checkoutOverlay').classList.add('open');
  document.getElementById('checkoutModal').classList.add('open');

  // Initialize the mini map
  setTimeout(() => {
    initCheckoutMap();
  }, 300);
}

function closeCheckoutModal() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.getElementById('checkoutModal').classList.remove('open');
  resetOtpState();
}

// ===== OTP FUNCTIONS =====

function resetOtpState() {
  phoneVerified = false;
  verifiedPhone = '';
  if (otpCooldownTimer) { clearInterval(otpCooldownTimer); otpCooldownTimer = null; }
  otpCooldownSeconds = 0;

  const statusEl = document.getElementById('otpStatus');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'otp-status'; }

  const verifySection = document.getElementById('otpVerifySection');
  if (verifySection) verifySection.style.display = 'none';

  const otpInput = document.getElementById('co_otp');
  if (otpInput) otpInput.value = '';

  const sendBtn = document.getElementById('otpSendBtn');
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send OTP'; }

  const payBtn = document.getElementById('rzpPayBtn');
  if (payBtn) {
    payBtn.disabled = true;
    payBtn.classList.add('rzp-pay-btn-disabled');
  }

  const noteEl = document.getElementById('otpRequiredNote');
  if (noteEl) noteEl.style.display = 'block';

  const timerEl = document.getElementById('otpTimer');
  if (timerEl) timerEl.innerHTML = '';
}

function startOtpCooldown() {
  otpCooldownSeconds = 60;
  const sendBtn = document.getElementById('otpSendBtn');
  const timerEl = document.getElementById('otpTimer');

  sendBtn.disabled = true;
  updateCooldownDisplay();

  otpCooldownTimer = setInterval(() => {
    otpCooldownSeconds--;
    if (otpCooldownSeconds <= 0) {
      clearInterval(otpCooldownTimer);
      otpCooldownTimer = null;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Resend OTP';
      if (timerEl) timerEl.innerHTML = '<span>Didn\'t receive it? Click Resend OTP</span>';
    } else {
      updateCooldownDisplay();
    }
  }, 1000);
}

function updateCooldownDisplay() {
  const timerEl = document.getElementById('otpTimer');
  const sendBtn = document.getElementById('otpSendBtn');
  if (timerEl) {
    timerEl.innerHTML = `⏳ Resend OTP in <span class="timer-count">${otpCooldownSeconds}s</span>`;
  }
  if (sendBtn) {
    sendBtn.textContent = `Wait ${otpCooldownSeconds}s`;
  }
}

async function sendOtp() {
  const phoneInput = document.getElementById('co_phone');
  const phone = phoneInput.value.trim();

  if (!phone) {
    showToast('Please enter your phone number first');
    phoneInput.focus();
    return;
  }

  const statusEl = document.getElementById('otpStatus');
  const sendBtn = document.getElementById('otpSendBtn');
  const verifySection = document.getElementById('otpVerifySection');

  // Show sending state
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  statusEl.textContent = '⏳ Sending';
  statusEl.className = 'otp-status pending';

  try {
    const response = await fetch(`${API_URL}/api/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send OTP');
    }

    // Show OTP input section
    verifySection.style.display = 'block';
    document.getElementById('co_otp').value = '';
    document.getElementById('co_otp').focus();

    statusEl.textContent = '⏳ OTP Sent';
    statusEl.className = 'otp-status pending';

    // For demo: show OTP in toast (remove in production)
    if (result.demo_otp) {
      showToast(`📱 Demo OTP: ${result.demo_otp}`);
    }

    startOtpCooldown();

  } catch (error) {
    console.error('Send OTP error:', error);
    statusEl.textContent = '❌ Failed';
    statusEl.className = 'otp-status error';
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send OTP';
    showToast(`⚠️ ${error.message}`);
  }
}

async function verifyOtp() {
  const phone = document.getElementById('co_phone').value.trim();
  const otp = document.getElementById('co_otp').value.trim();

  if (!otp || otp.length !== 6) {
    showToast('Please enter the 6-digit OTP');
    document.getElementById('co_otp').focus();
    return;
  }

  const statusEl = document.getElementById('otpStatus');
  const verifyBtn = document.getElementById('otpVerifyBtn');

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const response = await fetch(`${API_URL}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Verification failed');
    }

    // Success!
    phoneVerified = true;
    verifiedPhone = phone;
    statusEl.textContent = '✅ Verified';
    statusEl.className = 'otp-status verified';

    // Hide OTP section
    document.getElementById('otpVerifySection').style.display = 'none';

    // Disable phone input to prevent changes
    document.getElementById('co_phone').readOnly = true;
    document.getElementById('co_phone').style.background = '#e6f9ee';

    // Hide send OTP button
    document.getElementById('otpSendBtn').style.display = 'none';

    // Enable pay button (based on selected method)
    const payBtn = document.getElementById('rzpPayBtn');
    const codBtn = document.getElementById('codPayBtn');
    if (selectedPaymentMethod === 'razorpay') {
      payBtn.disabled = false;
      payBtn.classList.remove('rzp-pay-btn-disabled');
    } else {
      codBtn.disabled = false;
      codBtn.classList.remove('cod-pay-btn-disabled');
    }

    // Hide the OTP required note
    const noteEl = document.getElementById('otpRequiredNote');
    if (noteEl) noteEl.style.display = 'none';

    // Clear cooldown
    if (otpCooldownTimer) { clearInterval(otpCooldownTimer); otpCooldownTimer = null; }
    document.getElementById('otpTimer').innerHTML = '';

    showToast('✅ Phone number verified!');

  } catch (error) {
    console.error('Verify OTP error:', error);
    statusEl.textContent = '❌ Invalid';
    statusEl.className = 'otp-status error';
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
    showToast(`⚠️ ${error.message}`);
  }
}

// ===== PAYMENT METHOD SELECTION =====

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  const pmOnline = document.getElementById('pmOnline');
  const pmCOD = document.getElementById('pmCOD');
  const rzpBtn = document.getElementById('rzpPayBtn');
  const codBtn = document.getElementById('codPayBtn');
  const codSummary = document.getElementById('codAdvanceSummary');
  const feeRow = document.getElementById('co_fee_row');
  const payBadges = document.getElementById('payMethodsBadges');

  if (method === 'razorpay') {
    pmOnline.classList.add('active');
    pmCOD.classList.remove('active');
    rzpBtn.style.display = '';
    codBtn.style.display = 'none';
    codSummary.style.display = 'none';
    if (feeRow) feeRow.style.display = '';
    if (payBadges) payBadges.style.display = '';

    // Recalculate total with fee
    const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
    const fee = Math.round(total * 0.02);
    const grand = total + fee;
    document.getElementById('co_fee').textContent = '₹' + fee.toLocaleString('en-IN');
    document.getElementById('co_total_final').textContent = '₹' + grand.toLocaleString('en-IN');
    document.getElementById('rzp_amount_label').textContent = '₹' + grand.toLocaleString('en-IN');

    // Enable/disable based on OTP
    if (phoneVerified) {
      rzpBtn.disabled = false;
      rzpBtn.classList.remove('rzp-pay-btn-disabled');
    } else {
      rzpBtn.disabled = true;
      rzpBtn.classList.add('rzp-pay-btn-disabled');
    }
  } else {
    pmCOD.classList.add('active');
    pmOnline.classList.remove('active');
    rzpBtn.style.display = 'none';
    codBtn.style.display = 'flex';
    codSummary.style.display = 'block';
    if (feeRow) feeRow.style.display = 'none';
    if (payBadges) payBadges.style.display = 'none';

    // Total without Razorpay fee for COD
    const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
    document.getElementById('co_total_final').textContent = '₹' + total.toLocaleString('en-IN');

    const advance = Math.round(total * 0.25);
    const balance = total - advance;
    document.getElementById('codAdvanceAmount').textContent = '₹' + advance.toLocaleString('en-IN');
    document.getElementById('codBalanceAmount').textContent = '₹' + balance.toLocaleString('en-IN');
    document.getElementById('cod_amount_label').textContent = '₹' + advance.toLocaleString('en-IN');

    // Enable/disable based on OTP
    if (phoneVerified) {
      codBtn.disabled = false;
      codBtn.classList.remove('cod-pay-btn-disabled');
    } else {
      codBtn.disabled = true;
      codBtn.classList.add('cod-pay-btn-disabled');
    }
  }
}

// ===== COD PAYMENT (25% ADVANCE) =====

async function initiateCOD() {
  const name = document.getElementById('co_name').value.trim();
  const phone = document.getElementById('co_phone').value.trim();
  const address = document.getElementById('co_address').value.trim();
  const mapLocation = document.getElementById('co_map_location').value.trim();

  if (!name || !phone || !address || !mapLocation) {
    showToast('Please fill in your name, phone, address & map location');
    return;
  }

  if (!phoneVerified) {
    showToast('📱 Please verify your phone number with OTP first');
    return;
  }

  // Pre-checkout stock validation
  try {
    const productsRes = await fetch(`${API_URL}/api/products`);
    if (productsRes.ok) {
      const freshProducts = await productsRes.json();
      products = freshProducts;
      renderProducts();

      for (const item of cart) {
        const fresh = freshProducts.find(p => p.id === item.id);
        if (!fresh || fresh.stock_quantity <= 0) {
          showToast(`⚠️ ${item.name} is now out of stock!`);
          closeCheckoutModal();
          return;
        }
        if (item.qty > fresh.stock_quantity) {
          showToast(`⚠️ Only ${fresh.stock_quantity} units of ${item.name} left. Adjusting your cart.`);
          item.qty = fresh.stock_quantity;
          updateCart();
          closeCheckoutModal();
          return;
        }
      }
    }
  } catch (error) {
    console.error("Stock validation error:", error);
  }

  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const advanceAmount = Math.round(total * 0.25);
  const email = document.getElementById('co_email').value.trim() || '';

  // Open Razorpay for 25% advance
  fetch(`${API_URL}/api/razorpay-config`)
    .then(res => res.json())
    .then(config => {
      const options = {
        key: config.key_id,
        amount: advanceAmount * 100, // 25% only
        currency: 'INR',
        name: 'CrabFarm Co.',
        description: `COD Advance (25%) — ${cart.map(c => `${c.name} x${c.qty}`).join(', ')}`,
        image: '',
        handler: async function (response) {
          try {
            const orderData = {
              name, phone,
              email: email || null,
              address,
              note: document.getElementById('co_note').value.trim() || null,
              mapLocation,
              paymentMethod: 'cod',
              paymentId: response.razorpay_payment_id,
              totalAmount: total,
              advancePaid: advanceAmount,
              items: cart
            };
            const result = await saveOrderToDatabase(orderData);
            const orderId = result.orderId;

            closeCheckoutModal();
            closeCart();
            const cartCopy = [...cart];
            cart = [];
            updateCart();

            // Show notification status
            if (result.notificationSent === 'email') {
              showToast('✅ Order confirmed! Confirmation sent to your email 📧');
            } else if (result.notificationSent === 'sms') {
              showToast('✅ Order confirmed! Confirmation sent via SMS 📱');
            } else {
              showToast('✅ Order confirmed! 25% advance paid 🦀');
            }

            setTimeout(() => {
              const msg = encodeURIComponent(
                `Hi CrabFarm Co.! COD Order ✅\nAdvance Paid: ₹${advanceAmount.toLocaleString('en-IN')}\nPayment ID: ${response.razorpay_payment_id}\n\nOrder:\n` +
                cartCopy.map(c => `• ${c.name} x${c.qty}`).join('\n') +
                `\n\nTotal: ₹${total.toLocaleString('en-IN')}\nBalance on Delivery: ₹${(total - advanceAmount).toLocaleString('en-IN')}\n\nDelivery to: ${address}\nName: ${name}\nPhone: ${phone}`
              );
              window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');
              window.location.href = `/track.html?id=${orderId}`;
            }, 1800);
          } catch (error) {
            showToast('Failed to save order');
          }
        },
        prefill: { name, email: email || '', contact: phone },
        notes: { delivery_address: address, payment_type: 'cod_advance' },
        theme: { color: '#e67e22' },
        modal: { ondismiss: () => showToast('Payment cancelled') }
      };

      if (typeof Razorpay === 'undefined' || config.key_id === 'YOUR_RAZORPAY_KEY_ID') {
        showToast('⚠️ Add your Razorpay Key ID in .env to go live!');
        return;
      }
      const rzp = new Razorpay(options);
      rzp.open();
    })
    .catch(err => {
      console.error('Failed to fetch Razorpay config:', err);
      showToast('⚠️ Payment configuration error');
    });
}

async function saveOrderToDatabase(orderData) {
  try {
    const response = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to save order');
    return result;
  } catch (error) {
    console.error('Database error:', error);
    showToast('⚠️ Error saving order to database');
    throw error;
  }
}

async function initiateRazorpay() {
  const name = document.getElementById('co_name').value.trim();
  const phone = document.getElementById('co_phone').value.trim();
  const address = document.getElementById('co_address').value.trim();
  const mapLocation = document.getElementById('co_map_location').value.trim();

  if (!name || !phone || !address || !mapLocation) {
    showToast('Please fill in your name, phone, address & map location');
    return;
  }

  if (!phoneVerified) {
    showToast('📱 Please verify your phone number with OTP first');
    return;
  }

  // Pre-checkout stock validation
  try {
    const productsRes = await fetch(`${API_URL}/api/products`);
    if (productsRes.ok) {
      const freshProducts = await productsRes.json();
      // Update global products list
      products = freshProducts;
      renderProducts();

      for (const item of cart) {
        const fresh = freshProducts.find(p => p.id === item.id);
        if (!fresh || fresh.stock_quantity <= 0) {
          showToast(`⚠️ ${item.name} is now out of stock!`);
          closeCheckoutModal();
          return;
        }
        if (item.qty > fresh.stock_quantity) {
          showToast(`⚠️ Only ${fresh.stock_quantity} units of ${item.name} left in stock. Adjusting your cart.`);
          item.qty = fresh.stock_quantity;
          updateCart();
          closeCheckoutModal();
          return;
        }
      }
    }
  } catch (error) {
    console.error("Stock validation error:", error);
  }

  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const fee = Math.round(total * 0.02);
  const grand = total + fee;
  const email = document.getElementById('co_email').value.trim() || 'customer@crabfarmco.in';

  // Fetch Razorpay key from backend
  fetch(`${API_URL}/api/razorpay-config`)
    .then(res => res.json())
    .then(config => {
      const options = {
        key: config.key_id,
        amount: grand * 100,
        currency: 'INR',
        name: 'CrabFarm Co.',
        description: cart.map(c => `${c.name} x${c.qty}`).join(', '),
        image: '',
        handler: async function (response) {
          try {
            const orderData = {
              name, phone, email, address,
              note: document.getElementById('co_note').value.trim() || null,
              mapLocation,
              paymentMethod: 'razorpay',
              paymentId: response.razorpay_payment_id,
              totalAmount: grand,
              items: cart
            };
            const result = await saveOrderToDatabase(orderData);
            const orderId = result.orderId;

            closeCheckoutModal();
            closeCart();
            const cartCopy = [...cart];
            cart = [];
            updateCart();

            // Show notification status
            if (result.notificationSent === 'email') {
              showToast('✅ Payment successful! Confirmation sent to your email 📧');
            } else if (result.notificationSent === 'sms') {
              showToast('✅ Payment successful! Confirmation sent via SMS 📱');
            } else {
              showToast('Payment successful! Redirecting to tracking... 🦀');
            }
            setTimeout(() => {
              const msg = encodeURIComponent(
                `Hi CrabFarm Co.! Payment done ✅\nPayment ID: ${response.razorpay_payment_id}\n\nOrder:\n` +
                cartCopy.map(c => `• ${c.name} x${c.qty}`).join('\n') +
                `\n\nDelivery to: ${address}\nName: ${name}\nPhone: ${phone}`
              );
              window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');
              // Redirect to tracking page
              window.location.href = `/track.html?id=${orderId}`;
            }, 1800);
          } catch (error) {
            showToast('Failed to save order');
          }
        },
        prefill: { name, email, contact: phone },
        notes: { delivery_address: address },
        theme: { color: '#8B3A10' },
        modal: { ondismiss: () => showToast('Payment cancelled') }
      };

      if (typeof Razorpay === 'undefined' || config.key_id === 'YOUR_RAZORPAY_KEY_ID') {
        showToast('⚠️ Add your Razorpay Key ID in .env to go live!');
        console.warn('Set RAZORPAY_KEY_ID in your .env file with your real key from razorpay.com/dashboard');
        return;
      }
      const rzp = new Razorpay(options);
      rzp.open();
    })
    .catch(err => {
      console.error('Failed to fetch Razorpay config:', err);
      showToast('⚠️ Payment configuration error');
    });
}

async function waCheckout() {
  if (cart.length === 0) {
    showToast('Cart is empty!');
    return;
  }
  const lines = cart.map(c => `• ${c.name} x${c.qty} (₹${(c.qty * c.price).toLocaleString('en-IN')})`).join('\n');
  const total = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const msg = encodeURIComponent(`Hi CrabFarm Co.! I'd like to order:\n\n${lines}\n\nTotal: ₹${total.toLocaleString('en-IN')}\n\nPlease confirm availability and delivery details.`);

  try {
    const orderData = {
      name: 'WhatsApp Inquiry',
      phone: 'pending',
      email: null,
      address: 'pending',
      note: lines,
      paymentMethod: 'whatsapp',
      totalAmount: total,
      items: cart
    };
    const result = await saveOrderToDatabase(orderData);
    const orderId = result.orderId;

    showToast('Order saved! Opening WhatsApp & tracking page...');
    window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');

    setTimeout(() => {
      window.location.href = `/track.html?id=${orderId}`;
    }, 1200);
  } catch (error) {
    window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');
  }
}

async function submitForm() {
  const name = document.getElementById('contact_name').value.trim();
  const phone = document.getElementById('contact_phone').value.trim();
  const inquiryType = document.getElementById('contact_inquiry').value;
  const message = document.getElementById('contact_message').value.trim();

  if (!name || !phone || !message) {
    showToast('Please fill in all required fields');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, inquiryType, message })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    document.getElementById('contact_name').value = '';
    document.getElementById('contact_phone').value = '';
    document.getElementById('contact_message').value = '';
    showToast('✅ Message sent! We\'ll get back to you soon.');
  } catch (error) {
    console.error('Error submitting form:', error);
    showToast('⚠️ Error saving message');
  }
}

function toggleMenu() {
  const links = document.querySelector('.nav-links');
  if (!links) return;
  if (links.style.display === 'flex') {
    links.style.display = 'none';
  } else {
    links.style.display = 'flex';
    links.style.flexDirection = 'column';
    links.style.position = 'absolute';
    links.style.top = '64px';
    links.style.left = '0';
    links.style.right = '0';
    links.style.background = '#fdf8f0';
    links.style.padding = '20px 5vw';
    links.style.borderBottom = '1px solid #e8d8c0';
    links.style.zIndex = '99';
  }
}

// Dynamically apply settings fetched from database
function applySettings(settings) {
  if (!settings) return;

  if (settings.whatsapp_phone) {
    // Format PHONE for wa.me links (remove +, spaces, hyphens)
    PHONE = settings.whatsapp_phone.replace(/[+\s-]/g, '');
  }

  const location = settings.location || 'Andhra Pradesh, India';
  const cleanLocation = location.split(',')[0].trim(); // Get state name

  // Update UI Elements with Settings values if they exist
  const heroLocEl = document.getElementById('heroLocation');
  if (heroLocEl) heroLocEl.textContent = `Fresh · Farm-Raised · ${cleanLocation}`;

  const heroTitleEl = document.getElementById('heroTitle');
  if (heroTitleEl && settings.hero_title) heroTitleEl.innerHTML = settings.hero_title;

  const heroSubEl = document.getElementById('heroSubtitle');
  if (heroSubEl && settings.hero_subtitle) heroSubEl.textContent = settings.hero_subtitle;

  const shopSubEl = document.getElementById('shopSubtitle');
  if (shopSubEl) shopSubEl.textContent = `Live, fresh-cleaned, or packed — ordered today, delivered to you in ${cleanLocation}.`;

  const storyTitleEl = document.getElementById('storyTitle');
  if (storyTitleEl && settings.story_title) storyTitleEl.textContent = settings.story_title;

  const storyDescEl = document.getElementById('storyDesc');
  if (storyDescEl && settings.story_desc) storyDescEl.textContent = settings.story_desc;

  const storyPt1El = document.getElementById('storyPoint1');
  if (storyPt1El) storyPt1El.textContent = `Our mud crabs are raised in clean, controlled water ponds in ${cleanLocation}, fed on natural diet for premium quality.`;

  const delPt4El = document.getElementById('deliveryPoint4');
  if (delPt4El) delPt4El.textContent = `We deliver across ${cleanLocation} within 48 hours. Same-day delivery available in Chennai area.`;

  const contactLocEl = document.getElementById('contactLocation');
  if (contactLocEl) contactLocEl.innerHTML = `${location}<br>Delivery across ${cleanLocation}`;

  const contactPhoneEl = document.getElementById('contactPhone');
  if (contactPhoneEl && settings.whatsapp_phone) {
    contactPhoneEl.innerHTML = `${settings.whatsapp_phone}<br>Mon–Sat, 8am–6pm`;
  }

  const contactEmailEl = document.getElementById('contactEmail');
  if (contactEmailEl && settings.contact_email) {
    contactEmailEl.textContent = settings.contact_email;
  }

  const footerTextEl = document.getElementById('footerText');
  if (footerTextEl) footerTextEl.textContent = `Fresh mud crabs, farm-raised in ${cleanLocation}.`;

  const waBannerLink = document.getElementById('waBannerLink');
  if (waBannerLink) {
    waBannerLink.href = `https://wa.me/${PHONE}?text=Hi%20CrabFarm%20Co.!%20I%27d%20like%20to%20order%20mud%20crabs.`;
  }
}

// Initial Data Loader
async function loadInitialData() {
  try {
    // Fetch settings
    const settingsRes = await fetch(`${API_URL}/api/settings`);
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      applySettings(settings);
    }

    // Fetch products
    const productsRes = await fetch(`${API_URL}/api/products`);
    if (productsRes.ok) {
      products = await productsRes.json();
      renderProducts();
    }
  } catch (error) {
    console.error("Error loading initial data:", error);
    showToast("⚠️ Database connection error");
  }
}

// Geolocation location tracking
function getCurrentLocation() {
  const btn = document.getElementById('btnPinLocation');
  const input = document.getElementById('co_map_location');
  if (!btn || !input) return;

  if (!navigator.geolocation) {
    showToast('⚠️ Geolocation is not supported by your browser');
    return;
  }

  btn.disabled = true;
  btn.textContent = '📍 Locating...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      btn.disabled = false;
      btn.textContent = '📍 Pin Location';

      // Initialize map with user geolocation coordinates
      initCheckoutMap(lat, lng);
      showToast('✅ Pinned location coordinates successfully!');
    },
    (error) => {
      console.error('Geolocation error:', error);
      btn.disabled = false;
      btn.textContent = '📍 Pin Location';
      let errorMsg = 'Failed to get location';
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = 'Location permission denied. Please paste maps URL manually.';
      }
      showToast(`⚠️ ${errorMsg}`);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// ===== CHECKOUT MAP FUNCTIONS =====
let checkoutMap = null;
let checkoutMarker = null;

function initCheckoutMap(lat, lng) {
  const container = document.getElementById('checkoutMapContainer');
  if (container) container.style.display = 'block';

  // Default coordinates: Vijayawada, Andhra Pradesh, India
  const defaultLat = lat || 16.5062;
  const defaultLng = lng || 80.6480;

  if (!checkoutMap) {
    checkoutMap = L.map('checkoutMap').setView([defaultLat, defaultLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(checkoutMap);

    checkoutMarker = L.marker([defaultLat, defaultLng], {
      draggable: true
    }).addTo(checkoutMap);

    // Update coordinates when marker is dragged
    checkoutMarker.on('dragend', function () {
      const position = checkoutMarker.getLatLng();
      updateMapLocationInput(position.lat, position.lng);
    });

    // Update coordinates when map is clicked
    checkoutMap.on('click', function (e) {
      checkoutMarker.setLatLng(e.latlng);
      updateMapLocationInput(e.latlng.lat, e.latlng.lng);
    });
  } else {
    checkoutMap.setView([defaultLat, defaultLng], 14);
    checkoutMarker.setLatLng([defaultLat, defaultLng]);
  }

  updateMapLocationInput(defaultLat, defaultLng);

  // Force Leaflet recalculation
  setTimeout(() => {
    checkoutMap.invalidateSize();
  }, 100);
}

function updateMapLocationInput(lat, lng) {
  const mapsUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
  document.getElementById('co_map_location').value = mapsUrl;
  const coordsLabel = document.getElementById('mapCoordsLabel');
  if (coordsLabel) {
    coordsLabel.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

function parseCoords(locationStr) {
  if (!locationStr) return null;
  const regex = /q=([-+]?\d*\.\d+|\d+),([-+]?\d*\.\d+|\d+)/;
  let match = locationStr.match(regex);
  if (match) {
    return [parseFloat(match[1]), parseFloat(match[2])];
  }
  const directRegex = /([-+]?\d*\.\d+|\d+)\s*,\s*([-+]?\d*\.\d+|\d+)/;
  match = locationStr.match(directRegex);
  if (match) {
    return [parseFloat(match[1]), parseFloat(match[2])];
  }
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  loadInitialData();

  // Listen to manual coordinates input to sync with mini-map marker
  const mapInput = document.getElementById('co_map_location');
  if (mapInput) {
    mapInput.addEventListener('input', () => {
      const parsed = parseCoords(mapInput.value.trim());
      if (parsed && checkoutMap && checkoutMarker) {
        const [lat, lng] = parsed;
        checkoutMap.setView([lat, lng], 14);
        checkoutMarker.setLatLng([lat, lng]);
        const coordsLabel = document.getElementById('mapCoordsLabel');
        if (coordsLabel) coordsLabel.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    });
  }
});
