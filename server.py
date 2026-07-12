import os
import decimal
import datetime
import random
import time
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests as http_requests
from flask import Flask, request, jsonify, send_from_directory, g, session
from flask_cors import CORS
from dotenv import load_dotenv
import pymysql
import pymysql.cursors

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.getenv('SECRET_KEY', 'crabfarm_fallback_secret_key_8888')

# Configure CORS
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

PORT = int(os.getenv('PORT', 5000))

# Database configuration
DB_HOST = os.getenv('DB_HOST', os.getenv('MYSQLHOST', 'localhost'))
DB_PORT = int(os.getenv('DB_PORT', os.getenv('MYSQLPORT', 3306)))
DB_USER = os.getenv('DB_USER', os.getenv('MYSQLUSER', 'root'))
DB_PASSWORD = os.getenv('DB_PASSWORD', os.getenv('MYSQLPASSWORD', ''))
DB_NAME = os.getenv('DB_NAME', os.getenv('MYSQLDATABASE', 'crabfarm_db'))

# If running on Railway and DB_HOST is still set to localhost (e.g., copied from local env), override with Railway variables
if DB_HOST == 'localhost' and os.getenv('MYSQLHOST'):
    DB_HOST = os.getenv('MYSQLHOST')
    DB_PORT = int(os.getenv('MYSQLPORT', 3306))
    DB_USER = os.getenv('MYSQLUSER', 'root')
    DB_PASSWORD = os.getenv('MYSQLPASSWORD', '')
    DB_NAME = os.getenv('MYSQLDATABASE', 'crabfarm_db')

# Razorpay configuration
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'YOUR_RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'YOUR_RAZORPAY_KEY_SECRET')

# Email (SMTP) configuration
SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.gmail.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 587))
SMTP_EMAIL = os.getenv('SMTP_EMAIL', '')
SMTP_PASSWORD = os.getenv('SMTP_PASSWORD', '')

# SMS (Fast2SMS) configuration
FAST2SMS_API_KEY = os.getenv('FAST2SMS_API_KEY', '')

# In-memory OTP store: { phone: { otp, expires_at } }
otp_store = {}
OTP_EXPIRY_SECONDS = 300  # 5 minutes

def generate_otp():
    """Generate a random 6-digit OTP."""
    return str(random.randint(100000, 999999))

def validate_indian_phone(phone):
    """Validate Indian mobile number (10 digits, optionally prefixed with +91 or 91)."""
    # Strip everything except digits and '+'
    cleaned = re.sub(r'[^\d+]', '', phone)
    # Remove leading '+91', '91', or '+' if it exists
    if cleaned.startswith('+91'):
        cleaned = cleaned[3:]
    elif cleaned.startswith('91') and len(cleaned) == 12:
        cleaned = cleaned[2:]
    elif cleaned.startswith('+'):
        cleaned = cleaned[1:]
    
    # After stripping, check if we have a valid 10-digit Indian mobile number
    if len(cleaned) == 10 and cleaned[0] in '6789':
        return cleaned
    return None

from db_init import initialize_database

# Verify database connection on startup
try:
    initialize_database()
    conn_test = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )
    print("Database connection verified successfully")
    # Run dynamic schema migrations/updates
    with conn_test.cursor() as cur:
        try:
            cur.execute("SHOW COLUMNS FROM customers LIKE 'map_location';")
            if not cur.fetchone():
                print("Adding 'map_location' column to 'customers' table...")
                cur.execute("ALTER TABLE customers ADD COLUMN map_location VARCHAR(500) NULL;")
                conn_test.commit()
                print("'map_location' column added successfully")
        except Exception as migration_error:
            print(f"Migration error on customers: {migration_error}")

        try:
            cur.execute("SHOW COLUMNS FROM orders LIKE 'tracking_id';")
            if not cur.fetchone():
                print("Adding 'tracking_id' column to 'orders' table...")
                cur.execute("ALTER TABLE orders ADD COLUMN tracking_id VARCHAR(100) NULL;")
                conn_test.commit()
                print("'tracking_id' column added successfully")
        except Exception as migration_error:
            print(f"Migration error on orders: {migration_error}")

        try:
            cur.execute("SELECT `value` FROM settings WHERE `key` = 'whatsapp_phone';")
            row = cur.fetchone()
            if row:
                val = row['value'] if isinstance(row, dict) else row[0]
                if val == '+91 99999 99999':
                    print("Updating default WhatsApp phone number in database...")
                    cur.execute("UPDATE settings SET `value` = '+91 75690 47584' WHERE `key` = 'whatsapp_phone';")
                    conn_test.commit()
                    print("WhatsApp phone number updated successfully")
        except Exception as migration_error:
            print(f"Migration error on settings: {migration_error}")
    conn_test.close()
except Exception as e:
    print(f"Error connecting to MySQL: {e}")
    print("Ensure the MySQL80 service is running and credentials in .env are correct.")

# Helper to open connection before each request
@app.before_request
def before_request():
    try:
        g.db = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False
        )
    except Exception as e:
        g.db = None
        print(f"Request connection failed: {e}")

# Helper to close connection after each request
@app.teardown_request
def teardown_request(exception):
    db = getattr(g, 'db', None)
    if db is not None:
        db.close()

# Helper to auto-logout admin when navigating to public pages
@app.before_request
def auto_logout_on_public_pages():
    if request.path in ['/', '/index.html', '/track.html', '/login.html']:
        session.pop('admin_logged_in', None)

# Helper to enforce admin session authentication
@app.before_request
def check_admin_auth():
    if request.path.startswith('/api/admin/') and request.path not in ['/api/admin/login', '/api/admin/check-auth']:
        if not session.get('admin_logged_in'):
            return jsonify({'error': 'Unauthorized access'}), 401

# Helper to serialize datetimes and decimals for JSON responses
def serialize_value(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.isoformat()
    elif isinstance(val, decimal.Decimal):
        return float(val)
    return val

def format_row(row):
    if not row:
        return row
    return {k: serialize_value(v) for k, v in row.items()}

def format_rows(rows):
    return [format_row(row) for row in rows]

# Route to serve the frontend homepage
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# Route to serve the admin dashboard
@app.route('/admin')
def admin_page():
    return send_from_directory(app.static_folder, 'admin.html')

# Health check route
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'OK',
        'message': 'CrabFarm MySQL backend is running'
    })

# ===== PUBLIC API ENDPOINTS =====

# GET /api/products - Get active products
@app.route('/api/products', methods=['GET'])
def get_public_products():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute("SELECT id, name, emoji, badge, price, unit, `desc`, stock_quantity FROM products WHERE status = 'active';")
            products = cur.fetchall()
            return jsonify(format_rows(products))
    except Exception as e:
        return jsonify({'error': 'Failed to fetch products', 'details': str(e)}), 500

# GET /api/settings - Get public settings
@app.route('/api/settings', methods=['GET'])
def get_public_settings():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute("SELECT `key`, `value` FROM settings;")
            settings_rows = cur.fetchall()
            settings_dict = {row['key']: row['value'] for row in settings_rows}
            return jsonify(settings_dict)
    except Exception as e:
        return jsonify({'error': 'Failed to fetch settings', 'details': str(e)}), 500

# POST /api/contact - Save contact form submission
@app.route('/api/contact', methods=['POST'])
def submit_contact():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        name = data.get('name')
        phone = data.get('phone')
        inquiry_type = data.get('inquiryType', 'General')
        message = data.get('message')

        if not name or not phone or not message:
            return jsonify({'error': 'Missing required fields (name, phone, message)'}), 400

        with g.db.cursor() as cur:
            cur.execute(
                "INSERT INTO contact_submissions (name, phone, inquiry_type, message) VALUES (%s, %s, %s, %s);",
                (name, phone, inquiry_type, message)
            )
            g.db.commit()
            submission_id = cur.lastrowid
            
            # Fetch creation time
            cur.execute("SELECT created_at FROM contact_submissions WHERE id = %s;", (submission_id,))
            created_at = cur.fetchone()['created_at']

        return jsonify({
            'success': True,
            'submissionId': submission_id,
            'createdAt': serialize_value(created_at),
            'message': "Thank you! We'll get back to you soon."
        }), 201
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to save contact form', 'details': str(e)}), 500

# ===== ORDER NOTIFICATION HELPERS =====

def send_order_email(to_email, order_details):
    """Send order confirmation email via SMTP. Returns True on success."""
    if not SMTP_EMAIL or SMTP_EMAIL == 'your_email@gmail.com' or not SMTP_PASSWORD or SMTP_PASSWORD == 'your_app_password':
        print(f"[EMAIL] SMTP not configured. Would send to {to_email}:")
        print(f"  Order #{order_details['order_id']} — ₹{order_details['total_amount']}")
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f"🦀 CrabFarm Co. — Order #{order_details['order_id']} Confirmed!"
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email

        items_html = ''.join(
            f"<tr><td style='padding:6px 12px;border-bottom:1px solid #eee;'>{it['name']}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:center;'>{it['qty']}</td>"
            f"<td style='padding:6px 12px;border-bottom:1px solid #eee;text-align:right;'>₹{it['price']}</td></tr>"
            for it in order_details['items']
        )

        advance_section = ''
        if order_details.get('advance_paid'):
            advance_paid = order_details['advance_paid']
            balance = order_details['total_amount'] - advance_paid
            advance_section = f"""
            <tr><td colspan='2' style='padding:8px 12px;font-weight:600;'>Advance Paid (25%)</td>
                <td style='padding:8px 12px;text-align:right;color:#27ae60;font-weight:600;'>₹{advance_paid:,.0f}</td></tr>
            <tr><td colspan='2' style='padding:8px 12px;font-weight:600;'>Balance on Delivery</td>
                <td style='padding:8px 12px;text-align:right;color:#e67e22;font-weight:700;'>₹{balance:,.0f}</td></tr>
            """

        html_body = f"""
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fdf8f3;border-radius:16px;overflow:hidden;">
          <div style="background:#8B3A10;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">🦀 CrabFarm Co.</h1>
            <p style="margin:4px 0 0;opacity:0.85;">Order Confirmation</p>
          </div>
          <div style="padding:24px;">
            <h2 style="color:#8B3A10;margin-bottom:4px;">Order #{order_details['order_id']}</h2>
            <p style="color:#888;font-size:14px;">Payment: {order_details['payment_method'].upper()}</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <thead><tr style="background:#f5ebe0;">
                <th style="padding:8px 12px;text-align:left;">Item</th>
                <th style="padding:8px 12px;text-align:center;">Qty</th>
                <th style="padding:8px 12px;text-align:right;">Price</th>
              </tr></thead>
              <tbody>{items_html}</tbody>
              <tfoot>
                <tr style="background:#f5ebe0;"><td colspan='2' style='padding:8px 12px;font-weight:700;'>Total</td>
                    <td style='padding:8px 12px;text-align:right;font-weight:700;font-size:16px;'>₹{order_details['total_amount']:,.0f}</td></tr>
                {advance_section}
              </tfoot>
            </table>
            <div style="background:#fff;border:1px solid #e8ddd4;border-radius:10px;padding:14px;margin-top:16px;">
              <p style="margin:0 0 6px;font-weight:600;">📍 Delivery Address</p>
              <p style="margin:0;color:#555;font-size:14px;">{order_details['address']}</p>
            </div>
            <p style="text-align:center;margin-top:20px;">
              <a href="{order_details.get('track_url', '#')}" style="display:inline-block;background:#8B3A10;color:white;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:600;">Track Your Order</a>
            </p>
            <p style="text-align:center;font-size:12px;color:#888;margin-top:16px;">Thank you for ordering from CrabFarm Co.! 🦀</p>
          </div>
        </div>
        """

        msg.attach(MIMEText(html_body, 'html'))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

        print(f"[EMAIL] Order confirmation sent to {to_email}")
        return True
    except Exception as e:
        print(f"[EMAIL] Failed to send to {to_email}: {e}")
        return False


def send_order_sms(phone, order_details):
    """Send order confirmation SMS via Fast2SMS. Returns True on success."""
    if not FAST2SMS_API_KEY or FAST2SMS_API_KEY == 'YOUR_FAST2SMS_API_KEY':
        print(f"[SMS] Fast2SMS not configured. Would send to {phone}:")
        print(f"  Order #{order_details['order_id']} — ₹{order_details['total_amount']}")
        return False

    try:
        # Clean phone to 10 digits
        cleaned = re.sub(r'[\s\-\(\)\+]+', '', phone)
        if cleaned.startswith('91') and len(cleaned) == 12:
            cleaned = cleaned[2:]

        items_text = ', '.join(f"{it['name']} x{it['qty']}" for it in order_details['items'])
        
        sms_body = (f"CrabFarm Co. Order #{order_details['order_id']} confirmed! "
                    f"Items: {items_text}. "
                    f"Total: Rs.{order_details['total_amount']:,.0f}. ")
        
        if order_details.get('advance_paid'):
            balance = order_details['total_amount'] - order_details['advance_paid']
            sms_body += f"Advance paid: Rs.{order_details['advance_paid']:,.0f}. Balance COD: Rs.{balance:,.0f}. "
        
        sms_body += f"Track: {order_details.get('track_url', 'crabfarmco.in')}"

        response = http_requests.post(
            'https://www.fast2sms.com/dev/bulkV2',
            headers={'authorization': FAST2SMS_API_KEY},
            data={
                'route': 'q',
                'message': sms_body,
                'language': 'english',
                'flash': 0,
                'numbers': cleaned
            }
        )
        result = response.json()
        if result.get('return'):
            print(f"[SMS] Order confirmation sent to {cleaned}")
            return True
        else:
            print(f"[SMS] Failed: {result}")
            return False
    except Exception as e:
        print(f"[SMS] Error sending to {phone}: {e}")
        return False


# POST /api/orders - Create a new order with customer details
@app.route('/api/orders', methods=['POST'])
def create_order():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        name = data.get('name')
        phone = data.get('phone')
        email = data.get('email')
        address = data.get('address')
        note = data.get('note')
        items = data.get('items')
        total_amount = data.get('totalAmount')
        payment_method = data.get('paymentMethod')
        payment_id = data.get('paymentId')
        map_location = data.get('mapLocation')
        advance_paid = data.get('advancePaid')  # For COD orders (25% advance)

        # Validation
        if not name or not phone or not address or not items or total_amount is None:
            return jsonify({'error': 'Missing required fields'}), 400

        with g.db.cursor() as cur:
            # 1. Insert customer
            cur.execute(
                """INSERT INTO customers (name, phone, email, delivery_address, delivery_note, map_location)
                   VALUES (%s, %s, %s, %s, %s, %s);""",
                (name, phone, email if email else None, address, note if note else None, map_location if map_location else None)
            )
            customer_id = cur.lastrowid

            # 2. Create order
            import string
            tracking_id = f"CF-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"
            cur.execute(
                """INSERT INTO orders (customer_id, total_amount, payment_method, payment_id, order_status, tracking_id)
                   VALUES (%s, %s, %s, %s, %s, %s);""",
                (customer_id, total_amount, payment_method, payment_id if payment_id else None, 'pending', tracking_id)
            )
            order_id = cur.lastrowid

            # 3. Insert order items
            for item in items:
                cur.execute(
                    """INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
                       VALUES (%s, %s, %s, %s, %s);""",
                    (order_id, item.get('id'), item.get('name'), item.get('qty'), item.get('price'))
                )
                
                # Deduct stock
                cur.execute(
                    "UPDATE products SET stock_quantity = GREATEST(0, stock_quantity - %s) WHERE id = %s;",
                    (item.get('qty'), item.get('id'))
                )

            g.db.commit()
            
            # Fetch creation time
            cur.execute("SELECT created_at FROM orders WHERE id = %s;", (order_id,))
            created_at = cur.fetchone()['created_at']

        # ===== SEND ORDER NOTIFICATION =====
        notification_sent = 'none'
        order_notification = {
            'order_id': order_id,
            'name': name,
            'phone': phone,
            'address': address,
            'payment_method': payment_method,
            'total_amount': float(total_amount),
            'advance_paid': float(advance_paid) if advance_paid else None,
            'items': [{'name': it.get('name'), 'qty': it.get('qty'), 'price': it.get('price')} for it in items],
            'track_url': f"{request.host_url}track.html?id={order_id}"
        }

        # Priority: email first, SMS fallback
        if email and email.strip() and email != 'customer@crabfarmco.in':
            if send_order_email(email.strip(), order_notification):
                notification_sent = 'email'
            else:
                # Email failed, try SMS
                if send_order_sms(phone, order_notification):
                    notification_sent = 'sms'
        else:
            # No email provided, send SMS
            if send_order_sms(phone, order_notification):
                notification_sent = 'sms'

        print(f"[ORDER] #{order_id} created. Notification: {notification_sent}")

        return jsonify({
            'success': True,
            'orderId': order_id,
            'customerId': customer_id,
            'createdAt': serialize_value(created_at),
            'notificationSent': notification_sent,
            'message': 'Order created successfully'
        }), 201

    except Exception as e:
        g.db.rollback()
        print("Error creating order:", e)
        return jsonify({'error': 'Failed to create order', 'details': str(e)}), 500


# ===== PUBLIC ORDER TRACKING ENDPOINT =====

# GET /api/orders/<int:oid> - Get public order tracking details
@app.route('/api/orders/<int:oid>', methods=['GET'])
def get_order_tracking(oid):
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute(
                """SELECT o.id, o.customer_id, c.name, c.phone, c.delivery_address, c.delivery_note, c.map_location,
                          o.total_amount, o.payment_method, o.order_status, o.created_at, o.tracking_id
                   FROM orders o
                   JOIN customers c ON o.customer_id = c.id
                   WHERE o.id = %s;""",
                (oid,)
            )
            order = cur.fetchone()
            if not order:
                return jsonify({'error': 'Order not found'}), 404

            # Fetch items
            cur.execute(
                "SELECT product_id, product_name, quantity, unit_price FROM order_items WHERE order_id = %s;",
                (oid,)
            )
            order['items'] = format_rows(cur.fetchall())

            return jsonify(format_row(order))
    except Exception as e:
        print("Order tracking fetch error:", e)
        return jsonify({'error': 'Failed to fetch tracking details', 'details': str(e)}), 500



# ===== OTP VERIFICATION ENDPOINTS =====

# POST /api/send-otp - Send OTP to mobile number
@app.route('/api/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json() or {}
    phone = data.get('phone', '').strip()

    if not phone:
        return jsonify({'error': 'Phone number is required'}), 400

    # Validate Indian mobile number
    normalized_phone = validate_indian_phone(phone)
    if not normalized_phone:
        return jsonify({'error': 'Invalid Indian mobile number. Please enter a valid 10-digit number.'}), 400

    # Rate limit: prevent resend within 60 seconds
    existing = otp_store.get(normalized_phone)
    if existing and (time.time() - (existing['expires_at'] - OTP_EXPIRY_SECONDS)) < 60:
        remaining = int(60 - (time.time() - (existing['expires_at'] - OTP_EXPIRY_SECONDS)))
        return jsonify({'error': f'Please wait {remaining} seconds before requesting a new OTP'}), 429

    otp = generate_otp()
    otp_store[normalized_phone] = {
        'otp': otp,
        'expires_at': time.time() + OTP_EXPIRY_SECONDS
    }

    # In production: send OTP via SMS gateway (MSG91, Twilio, etc.)
    # For demo/testing: log to console and return in response
    print(f"\n[OTP] OTP for +91{normalized_phone}: {otp}\n")

    return jsonify({
        'success': True,
        'message': 'OTP sent successfully',
        'phone': normalized_phone,
        # REMOVE the line below in production — OTP should only be sent via SMS
        'demo_otp': otp
    })

# POST /api/verify-otp - Verify the OTP entered by user
@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json() or {}
    phone = data.get('phone', '').strip()
    user_otp = data.get('otp', '').strip()

    if not phone or not user_otp:
        return jsonify({'error': 'Phone number and OTP are required'}), 400

    normalized_phone = validate_indian_phone(phone)
    if not normalized_phone:
        return jsonify({'error': 'Invalid phone number'}), 400

    stored = otp_store.get(normalized_phone)
    if not stored:
        return jsonify({'error': 'No OTP was sent to this number. Please request a new OTP.'}), 400

    # Check expiry
    if time.time() > stored['expires_at']:
        del otp_store[normalized_phone]
        return jsonify({'error': 'OTP has expired. Please request a new one.'}), 400

    # Check OTP match
    if stored['otp'] != user_otp:
        return jsonify({'error': 'Invalid OTP. Please try again.'}), 400

    # OTP verified — clean up
    del otp_store[normalized_phone]

    return jsonify({
        'success': True,
        'verified': True,
        'phone': normalized_phone,
        'message': 'Phone number verified successfully'
    })

# GET /api/razorpay-config - Return Razorpay public key to frontend
@app.route('/api/razorpay-config', methods=['GET'])
def razorpay_config():
    return jsonify({
        'key_id': RAZORPAY_KEY_ID
    })


# ===== ADMIN AUTHENTICATION ENDPOINTS =====

# POST /api/admin/login - Login admin user
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    
    expected_username = os.getenv('ADMIN_USERNAME', 'admin')
    expected_password = os.getenv('ADMIN_PASSWORD', 'admin123')
    
    if username == expected_username and password == expected_password:
        session['admin_logged_in'] = True
        return jsonify({'success': True, 'message': 'Login successful'})
    else:
        return jsonify({'error': 'Invalid username or password'}), 401

# POST /api/admin/logout - Logout admin user
@app.route('/api/admin/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_logged_in', None)
    return jsonify({'success': True, 'message': 'Logout successful'})

# GET /api/admin/check-auth - Verify authentication status
@app.route('/api/admin/check-auth', methods=['GET'])
def admin_check_auth():
    is_authenticated = session.get('admin_logged_in', False)
    return jsonify({'authenticated': is_authenticated})


# ===== ADMINISTRATIVE API ENDPOINTS =====

# GET /api/admin/products - Get all products
@app.route('/api/admin/products', methods=['GET'])
def admin_get_products():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute("SELECT id, name, emoji, badge, price, unit, `desc`, stock_quantity, status FROM products;")
            products = cur.fetchall()
            return jsonify(format_rows(products))
    except Exception as e:
        return jsonify({'error': 'Failed to fetch products', 'details': str(e)}), 500

# POST /api/admin/products - Create a new product
@app.route('/api/admin/products', methods=['POST'])
def admin_create_product():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        name = data.get('name')
        emoji = data.get('emoji', '🦀')
        badge = data.get('badge', '')
        price = data.get('price')
        unit = data.get('unit', 'kg')
        desc = data.get('desc', '')
        stock_quantity = data.get('stock_quantity', 100)
        status = data.get('status', 'active')

        if not name or price is None:
            return jsonify({'error': 'Product name and price are required'}), 400

        with g.db.cursor() as cur:
            cur.execute(
                """INSERT INTO products (name, emoji, badge, price, unit, `desc`, stock_quantity, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s);""",
                (name, emoji, badge, price, unit, desc, stock_quantity, status)
            )
            g.db.commit()
            product_id = cur.lastrowid
        return jsonify({'success': True, 'productId': product_id, 'message': 'Product created'}), 201
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to create product', 'details': str(e)}), 500

# PUT /api/admin/products/<id> - Update a product
@app.route('/api/admin/products/<int:pid>', methods=['PUT'])
def admin_update_product(pid):
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        name = data.get('name')
        emoji = data.get('emoji')
        badge = data.get('badge')
        price = data.get('price')
        unit = data.get('unit')
        desc = data.get('desc')
        stock_quantity = data.get('stock_quantity')
        status = data.get('status')

        if not name or price is None:
            return jsonify({'error': 'Name and price are required'}), 400

        with g.db.cursor() as cur:
            cur.execute(
                """UPDATE products 
                   SET name=%s, emoji=%s, badge=%s, price=%s, unit=%s, `desc`=%s, stock_quantity=%s, status=%s 
                   WHERE id=%s;""",
                (name, emoji, badge, price, unit, desc, stock_quantity, status, pid)
            )
            g.db.commit()
        return jsonify({'success': True, 'message': 'Product updated'})
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to update product', 'details': str(e)}), 500

# DELETE /api/admin/products/<id> - Delete a product
@app.route('/api/admin/products/<int:pid>', methods=['DELETE'])
def admin_delete_product(pid):
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute("DELETE FROM products WHERE id = %s;", (pid,))
            g.db.commit()
        return jsonify({'success': True, 'message': 'Product deleted'})
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to delete product', 'details': str(e)}), 500

# GET /api/admin/orders - Get all orders with customers and items
@app.route('/api/admin/orders', methods=['GET'])
def admin_get_orders():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute(
                """SELECT o.id, o.customer_id, c.name, c.phone, c.email, c.delivery_address, c.delivery_note, c.map_location,
                          o.total_amount, o.payment_method, o.payment_id, o.order_status, o.created_at, o.tracking_id
                   FROM orders o
                   JOIN customers c ON o.customer_id = c.id
                   ORDER BY o.created_at DESC;"""
            )
            orders = cur.fetchall()
            
            # Fetch items for all orders
            for order in orders:
                cur.execute(
                    "SELECT product_id, product_name, quantity, unit_price FROM order_items WHERE order_id = %s;",
                    (order['id'],)
                )
                order['items'] = format_rows(cur.fetchall())

            return jsonify({'orders': format_rows(orders)})
    except Exception as e:
        print("Admin orders fetch error:", e)
        return jsonify({'error': 'Failed to fetch orders', 'details': str(e)}), 500

# PUT /api/admin/orders/<id>/status - Update order status
@app.route('/api/admin/orders/<int:oid>/status', methods=['PUT'])
def admin_update_order_status(oid):
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        status = data.get('status')
        if not status:
            return jsonify({'error': 'Status is required'}), 400

        with g.db.cursor() as cur:
            cur.execute("UPDATE orders SET order_status = %s WHERE id = %s;", (status, oid))
            g.db.commit()
        return jsonify({'success': True, 'message': 'Order status updated'})
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to update order status', 'details': str(e)}), 500

# GET /api/admin/contact-submissions - Get contact list
@app.route('/api/admin/contact-submissions', methods=['GET'])
def admin_get_contacts():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        with g.db.cursor() as cur:
            cur.execute("SELECT id, name, phone, inquiry_type, message, created_at FROM contact_submissions ORDER BY created_at DESC;")
            submissions = cur.fetchall()
            return jsonify({'submissions': format_rows(submissions)})
    except Exception as e:
        return jsonify({'error': 'Failed to fetch contact submissions', 'details': str(e)}), 500

# PUT /api/admin/settings - Update site settings
@app.route('/api/admin/settings', methods=['PUT'])
def admin_update_settings():
    if not g.db:
        return jsonify({'error': 'Database offline'}), 500
    try:
        data = request.get_json() or {}
        with g.db.cursor() as cur:
            for key, val in data.items():
                cur.execute(
                    "INSERT INTO settings (`key`, `value`) VALUES (%s, %s) ON DUPLICATE KEY UPDATE `value` = %s;",
                    (key, val, val)
                )
            g.db.commit()
        return jsonify({'success': True, 'message': 'Settings updated successfully'})
    except Exception as e:
        g.db.rollback()
        return jsonify({'error': 'Failed to update settings', 'details': str(e)}), 500


# Error handlers
@app.errorhandler(500)
def internal_server_error(e):
    return jsonify({'error': 'Internal server error', 'details': str(e)}), 500

@app.errorhandler(404)
def page_not_found(e):
    return jsonify({'error': 'Resource not found'}), 404

if __name__ == '__main__':
    print(f"CrabFarm MySQL backend running on http://localhost:{PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=True)
