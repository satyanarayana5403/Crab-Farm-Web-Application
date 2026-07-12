const API_URL = ''; // Relative path because backend serves frontend
let currentTab = 'orders';

// Tab switching logic
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    
    item.classList.add('active');
    const tabName = item.getAttribute('data-tab');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    currentTab = tabName;
    loadTabData();
  });
});

// Toast notification helper
function showToast(msg) {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// Route data loader based on active tab
function loadTabData() {
  if (currentTab === 'orders') fetchOrders();
  else if (currentTab === 'products') fetchProducts();
  else if (currentTab === 'contacts') fetchContactSubmissions();
  else if (currentTab === 'settings') fetchSettings();
}

let allOrders = [];

async function fetchOrders() {
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center">Loading orders...</td></tr>';
  
  try {
    const res = await fetch(`${API_URL}/api/admin/orders`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    allOrders = data.orders || [];
    
    // Update stats
    document.getElementById('statOrdersCount').textContent = allOrders.length;
    
    let salesTotal = 0;
    let pendingCount = 0;
    
    allOrders.forEach(o => {
      if (o.order_status === 'pending') pendingCount++;
      if (o.order_status !== 'cancelled' && o.order_status !== 'pending') {
        salesTotal += parseFloat(o.total_amount);
      }
    });
    
    document.getElementById('statSalesAmount').textContent = '₹' + salesTotal.toLocaleString('en-IN');
    document.getElementById('statPendingCount').textContent = pendingCount;
    
    sortAndRenderOrders();
    
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">⚠️ Error loading orders from database.</td></tr>';
  }
}

function sortAndRenderOrders() {
  const tbody = document.getElementById('ordersTableBody');
  const sortVal = document.getElementById('orderSortSelect')?.value || 'date-desc';
  
  let sorted = [...allOrders];
  
  if (sortVal === 'date-desc') {
    sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sortVal === 'date-asc') {
    sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sortVal === 'amount-desc') {
    sorted.sort((a, b) => parseFloat(b.total_amount) - parseFloat(a.total_amount));
  } else if (sortVal === 'amount-asc') {
    sorted.sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
  } else if (sortVal === 'status-pending') {
    sorted.sort((a, b) => {
      if (a.order_status === 'pending' && b.order_status !== 'pending') return -1;
      if (a.order_status !== 'pending' && b.order_status === 'pending') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No orders found.</td></tr>';
    return;
  }
  
  tbody.innerHTML = sorted.map(o => {
    const orderDate = new Date(o.created_at).toLocaleString('en-IN');
    const itemsList = o.items.map(item => `• ${item.product_name} x${item.quantity} (₹${item.unit_price}/u)`).join('<br>');
    
    return `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>
          <span style="font-family:monospace;font-size:12px;font-weight:600;color:var(--rust);">${o.tracking_id || 'N/A'}</span>
        </td>
        <td>
          <strong>${o.name}</strong><br>
          <span style="font-size:11px;color:var(--muted);">${o.phone}</span><br>
          <span style="font-size:11px;color:var(--muted);">${o.email || 'No Email'}</span>
        </td>
        <td>
          ${o.delivery_address}<br>
          ${o.map_location ? `<a href="${o.map_location}" target="_blank" style="font-size:11px; color:#2980b9; text-decoration:underline; font-weight:600; display:inline-block; margin-top:4px;">📍 View Map Pin</a><br>` : ''}
          <em style="font-size:11px;color:var(--rust);">${o.delivery_note ? 'Note: ' + o.delivery_note : ''}</em>
        </td>
        <td style="font-size:12px; line-height:1.4;">${itemsList}</td>
        <td><strong>₹${parseFloat(o.total_amount).toLocaleString('en-IN')}</strong></td>
        <td>
          <span style="text-transform:uppercase; font-size:11px; font-weight:500;">${o.payment_method}</span><br>
          <span style="font-size:10px;color:var(--muted);">${o.payment_id || 'N/A'}</span>
        </td>
        <td>
          <span class="badge-status ${o.order_status}">${o.order_status}</span><br>
          <span style="font-size:10px;color:var(--muted);">${orderDate}</span>
        </td>
        <td>
          <select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)">
            <option value="pending" ${o.order_status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${o.order_status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="shipped" ${o.order_status === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${o.order_status === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${o.order_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Update failed');
    showToast(`Order #${orderId} updated to ${newStatus}`);
    fetchOrders(); // Refresh table
  } catch (err) {
    showToast('⚠️ Failed to update order status');
  }
}

// ===== PRODUCTS SECTION =====

async function fetchProducts() {
  const grid = document.getElementById('productsGridAdmin');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;">Loading inventory...</div>';
  
  try {
    const res = await fetch(`${API_URL}/api/admin/products`);
    if (!res.ok) throw new Error('Fetch failed');
    const products = await res.json();
    
    if (products.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;">No products in database.</div>';
      return;
    }
    
    grid.innerHTML = products.map(p => `
      <div class="prod-card-admin" style="opacity: ${p.status === 'inactive' ? 0.6 : 1}">
        <div class="prod-card-header">
          <div class="prod-emoji-circle">${p.emoji}</div>
          <div class="prod-info-admin">
            <h3>${p.name}</h3>
            ${p.badge ? `<span class="prod-badge-tag">${p.badge}</span>` : ''}
          </div>
        </div>
        <div class="prod-card-desc">${p.desc || 'No description provided.'}</div>
        <div class="prod-details-grid">
          <div>
            <span style="color:var(--muted); font-size:11px;">Price</span>
            <div class="prod-detail-val">₹${parseFloat(p.price).toLocaleString('en-IN')} / ${p.unit}</div>
          </div>
          <div>
            <span style="color:var(--muted); font-size:11px;">Stock Status</span>
            <div class="prod-detail-val" style="color: ${parseInt(p.stock_quantity) <= 5 ? 'var(--status-cancelled)' : 'var(--text)'}">
              ${p.stock_quantity} units
            </div>
          </div>
        </div>
        <div class="prod-card-actions">
          <button class="btn-edit" onclick="editProduct(${p.id}, '${escapeHtml(p.name)}', '${p.emoji}', '${escapeHtml(p.badge || '')}', ${p.price}, '${p.unit}', '${escapeHtml(p.desc || '')}', ${p.stock_quantity}, '${p.status}')">✏️ Edit</button>
          <button class="btn-delete" onclick="deleteProduct(${p.id})">✕ Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--status-cancelled);padding:40px;">⚠️ Error loading inventory from database.</div>';
  }
}

function openProductModal() {
  document.getElementById('modalTitle').textContent = 'Add New Product';
  document.getElementById('productForm').reset();
  document.getElementById('prod_id').value = '';
  document.getElementById('productModal').classList.add('open');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
}

function editProduct(id, name, emoji, badge, price, unit, desc, stock, status) {
  document.getElementById('modalTitle').textContent = 'Edit Product';
  document.getElementById('prod_id').value = id;
  document.getElementById('prod_name').value = name;
  document.getElementById('prod_emoji').value = emoji;
  document.getElementById('prod_badge').value = badge;
  document.getElementById('prod_price').value = price;
  document.getElementById('prod_unit').value = unit;
  document.getElementById('prod_stock').value = stock;
  document.getElementById('prod_status').value = status;
  document.getElementById('prod_desc').value = desc;
  document.getElementById('productModal').classList.add('open');
}

async function saveProduct(event) {
  event.preventDefault();
  const id = document.getElementById('prod_id').value;
  const name = document.getElementById('prod_name').value.trim();
  const emoji = document.getElementById('prod_emoji').value.trim();
  const badge = document.getElementById('prod_badge').value.trim();
  const price = parseFloat(document.getElementById('prod_price').value);
  const unit = document.getElementById('prod_unit').value.trim();
  const stock = parseInt(document.getElementById('prod_stock').value);
  const status = document.getElementById('prod_status').value;
  const desc = document.getElementById('prod_desc').value.trim();

  const payload = {
    name, emoji, badge, price, unit, desc, stock_quantity: stock, status
  };

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/admin/products/${id}` : `${API_URL}/api/admin/products`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    showToast(isEdit ? 'Product updated successfully' : 'Product created successfully');
    closeProductModal();
    fetchProducts();
  } catch (err) {
    showToast('⚠️ Error saving product details');
  }
}

async function deleteProduct(pid) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    const res = await fetch(`${API_URL}/api/admin/products/${pid}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    showToast('Product deleted from catalog');
    fetchProducts();
  } catch (err) {
    showToast('⚠️ Error deleting product');
  }
}

// ===== CONTACTS SECTION =====

async function fetchContactSubmissions() {
  const container = document.getElementById('messagesList');
  container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">Loading messages...</div>';
  
  try {
    const res = await fetch(`${API_URL}/api/admin/contact-submissions`);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    const submissions = data.submissions || [];
    
    if (submissions.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:40px;">No messages received.</div>';
      return;
    }
    
    container.innerHTML = submissions.map(s => {
      const msgDate = new Date(s.created_at).toLocaleString('en-IN');
      return `
        <div class="message-card">
          <div class="message-meta">
            <div>
              <strong>${s.name}</strong> (${s.phone}) | Inquiry: <span style="color:var(--rust); font-weight:700;">${s.inquiry_type}</span>
            </div>
            <div>${msgDate}</div>
          </div>
          <div class="message-body">${s.message}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="text-align:center;color:var(--status-cancelled);padding:40px;">⚠️ Error loading messages.</div>';
  }
}

// ===== SETTINGS SECTION =====

async function fetchSettings() {
  try {
    const res = await fetch(`${API_URL}/api/settings`);
    if (!res.ok) throw new Error('Fetch settings failed');
    const settings = await res.json();
    
    // Fill form fields
    document.getElementById('set_whatsapp').value = settings.whatsapp_phone || '';
    document.getElementById('set_location').value = settings.location || '';
    document.getElementById('set_email').value = settings.contact_email || '';
    document.getElementById('set_hero_title').value = settings.hero_title || '';
    document.getElementById('set_hero_subtitle').value = settings.hero_subtitle || '';
    document.getElementById('set_story_title').value = settings.story_title || '';
    document.getElementById('set_story_desc').value = settings.story_desc || '';
  } catch (err) {
    showToast('⚠️ Error loading page settings');
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = {
    whatsapp_phone: document.getElementById('set_whatsapp').value.trim(),
    location: document.getElementById('set_location').value.trim(),
    contact_email: document.getElementById('set_email').value.trim(),
    hero_title: document.getElementById('set_hero_title').value.trim(),
    hero_subtitle: document.getElementById('set_hero_subtitle').value.trim(),
    story_title: document.getElementById('set_story_title').value.trim(),
    story_desc: document.getElementById('set_story_desc').value.trim()
  };

  try {
    const res = await fetch(`${API_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save settings failed');
    showToast('Configurations saved successfully!');
  } catch (err) {
    showToast('⚠️ Failed to save site configuration');
  }
}

// Helper to escape HTML tags inside product parameters
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Logout function (bound globally to avoid cache mismatch reference errors)
async function logoutAdmin() {
  if (!confirm('Are you sure you want to log out?')) return;
  try {
    const res = await fetch(`${API_URL}/api/admin/logout`, { method: 'POST' });
    if (res.ok) {
      window.location.replace('/login.html');
    } else {
      showToast('⚠️ Logout failed');
    }
  } catch (err) {
    showToast('⚠️ Error logging out');
  }
}
window.logoutAdmin = logoutAdmin;

// Load initial tab data
loadTabData();
