# CrabFarm Co. Backend Setup Guide

## Prerequisites
- **Node.js** (v14+) - [Download](https://nodejs.org/)
- **PostgreSQL** (v12+) - [Download](https://www.postgresql.org/download/)
- **npm** (comes with Node.js)

---

## Step 1: Install PostgreSQL & Create Database

### On Windows:
1. Download and install PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/)
2. Remember your password during installation
3. Open **pgAdmin 4** (included with PostgreSQL) or use command line:

```bash
psql -U postgres -c "CREATE DATABASE crabfarm_db;"
```

### Load the database schema:
```bash
psql -U postgres -d crabfarm_db -f schema.sql
```

---

## Step 2: Setup Backend Environment

### 1. Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```

### 2. Edit `.env` with your database credentials:
```
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=crabfarm_db
PORT=5000
NODE_ENV=development
CORS_ORIGIN=file://
```

### 3. Install dependencies:
```bash
npm install
```

### 4. Start the server:
```bash
npm start
```

You should see:
```
🦀 CrabFarm backend running on http://localhost:5000
Health check: http://localhost:5000/health
```

---

## API Endpoints

### **POST /api/orders** - Create an order
Save customer checkout data and order items.

**Request:**
```json
{
  "name": "Ramesh Kumar",
  "phone": "+91 98765 43210",
  "email": "ramesh@example.com",
  "address": "123 Main St, Chennai, 600001",
  "note": "Call before delivery",
  "paymentMethod": "razorpay",
  "paymentId": "pay_xxx",
  "totalAmount": 2000,
  "items": [
    {"id": 1, "name": "Live Mud Crab", "qty": 2, "price": 450},
    {"id": 3, "name": "Cleaned & Packed", "qty": 1, "price": 520}
  ]
}
```

**Response:**
```json
{
  "success": true,
  "orderId": 5,
  "customerId": 8,
  "createdAt": "2026-04-07T10:30:00Z",
  "message": "Order created successfully"
}
```

---

### **POST /api/contact** - Save contact form submission

**Request:**
```json
{
  "name": "John Doe",
  "phone": "9876543210",
  "inquiryType": "Bulk Order",
  "message": "I need 50kg of mud crabs for an event"
}
```

**Response:**
```json
{
  "success": true,
  "submissionId": 3,
  "createdAt": "2026-04-07T10:30:00Z",
  "message": "Thank you! We'll get back to you soon."
}
```

---

### **GET /api/orders** - Fetch all orders
Returns list of all orders with customer details.

---

### **GET /api/orders/:id** - Fetch specific order
Returns order details with order items.

---

### **GET /api/contact-submissions** - Fetch contact forms
Returns all contact form submissions.

---

### **GET /api/customers** - Fetch all customers
Returns list of all customers who ordered.

---

## Step 3: Update Website to Use Backend

Update your `crabfarm_website.html`:

1. Change the API endpoint URL at the top of the script:
```javascript
const API_URL = 'http://localhost:5000'; // For local development
// Change to your domain when deploying: 'https://yourdomain.com'
```

2. The JavaScript will automatically send:
   - **Orders** → `/api/orders` (when clicking Razorpay or WhatsApp checkout)
   - **Contact forms** → `/api/contact` (when submitting the contact form)

---

## Testing the Setup

### Test the API:
```bash
# Check if backend is running
curl http://localhost:5000/health

# Create a test order
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "phone": "9000000000",
    "email": "test@example.com",
    "address": "Test Address",
    "paymentMethod": "whatsapp",
    "totalAmount": 1000,
    "items": [{"id": 1, "name": "Live Mud Crab", "qty": 1, "price": 450}]
  }'
```

---

## Database Management

### View all orders in PostgreSQL:
```bash
psql -U postgres -d crabfarm_db -c "SELECT * FROM orders;"
```

### View all contact submissions:
```bash
psql -U postgres -d crabfarm_db -c "SELECT * FROM contact_submissions;"
```

### Backup your database:
```bash
pg_dump -U postgres -d crabfarm_db -f backup.sql
```

---

## Deployment

### When deploying to production:
1. Set `NODE_ENV=production`
2. Update database credentials to your hosted PostgreSQL (AWS RDS, Azure Database, etc.)
3. Update `CORS_ORIGIN` to your domain
4. Update `API_URL` in HTML to your backend domain
5. Deploy using Heroku, Railway, or your hosting provider

---

## Troubleshooting

### "Cannot connect to database"
- Ensure PostgreSQL is running
- Check DB credentials in `.env`
- Verify database exists: `psql -U postgres -l`

### "CORS error"
- Update `CORS_ORIGIN` in `.env` to match your website domain

### "npm: command not found"
- Install Node.js from nodejs.org
- Restart your terminal

---

**Questions?** Refer to the API documentation above or check server logs for details.
