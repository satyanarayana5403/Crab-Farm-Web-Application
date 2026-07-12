import os
import pymysql
from dotenv import load_dotenv

# Load env variables
load_dotenv()

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

def initialize_database():
    print(f"Connecting to MySQL at {DB_HOST}:{DB_PORT} as user '{DB_USER}'...")
    
    # Connect without specifying database to create it first
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            autocommit=True
        )
    except Exception as e:
        print(f"Connection failed: {e}")
        print("Please check that MySQL80 service is running and credentials in .env are correct.")
        return False
        
    cur = conn.cursor()
    
    # Create Database
    print(f"Creating database '{DB_NAME}' if not exists...")
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    conn.select_db(DB_NAME)
    
    # 1. Customers Table
    print("Creating 'customers' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            email VARCHAR(255),
            delivery_address TEXT NOT NULL,
            delivery_note TEXT,
            map_location VARCHAR(500),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    """)
    
    # 2. Orders Table
    print("Creating 'orders' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            total_amount DECIMAL(10, 2) NOT NULL,
            payment_method VARCHAR(50) NOT NULL,
            payment_id VARCHAR(255),
            order_status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    """)
    
    # 3. Order Items Table
    print("Creating 'order_items' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_id INT NOT NULL,
            product_name VARCHAR(255) NOT NULL,
            quantity INT NOT NULL,
            unit_price DECIMAL(10, 2) NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    """)
    
    # 4. Contact Submissions Table
    print("Creating 'contact_submissions' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS contact_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            inquiry_type VARCHAR(100),
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    """)
    
    # 5. Products Table
    print("Creating 'products' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            emoji VARCHAR(50) NOT NULL,
            badge VARCHAR(100),
            price DECIMAL(10, 2) NOT NULL,
            unit VARCHAR(50) NOT NULL,
            `desc` TEXT,
            stock_quantity INT DEFAULT 100,
            status VARCHAR(20) DEFAULT 'active'
        ) ENGINE=InnoDB;
    """)
    
    # 6. Settings Table
    print("Creating 'settings' table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            `key` VARCHAR(100) PRIMARY KEY,
            `value` TEXT NOT NULL
        ) ENGINE=InnoDB;
    """)
    
    # Populate Default Products
    cur.execute("SELECT COUNT(*) FROM products;")
    if cur.fetchone()[0] == 0:
        print("Inserting default product catalog...")
        default_products = [
            ('Live Mud Crab', '🦀', 'Best Seller', 450.00, 'kg', 'Premium grade live mud crabs, 300–600g each. Best for curries, pepper fry & biryani.', 100, 'active'),
            ('Large Mud Crab', '🦀', 'Premium', 600.00, 'kg', 'Select large crabs 600g–1kg each. Perfect for special occasions and bulk meat.', 50, 'active'),
            ('Cleaned & Packed', '📦', 'Ready to Cook', 520.00, 'kg', 'Freshly cleaned, cut, and vacuum-packed. Ready to cook straight from the box.', 40, 'active'),
            ('Bulk Pack (5 kg)', '🧺', 'Best Value', 2000.00, 'pack', '5 kg of live mud crabs, ideal for restaurants, events, or family gatherings.', 10, 'active'),
            ('Party Pack (10 kg)', '🎉', 'Wholesale', 3800.00, 'pack', '10 kg bulk order for events, weddings, or restaurant supply. Big savings included.', 5, 'active'),
            ('Crab Roe (Egg)', '🟠', 'Seasonal', 800.00, 'kg', 'Rich, flavourful crab roe available in season. A delicacy for true seafood lovers.', 15, 'active')
        ]
        cur.executemany("""
            INSERT INTO products (name, emoji, badge, price, unit, `desc`, stock_quantity, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
        """, default_products)
        
    # Populate Default Settings
    cur.execute("SELECT COUNT(*) FROM settings;")
    if cur.fetchone()[0] == 0:
        print("Inserting default settings...")
        default_settings = [
            ('whatsapp_phone', '+91 75690 47584'),
            ('location', 'Andhra Pradesh, India'),
            ('contact_email', 'hello@crabfarmco.in'),
            ('hero_title', 'Premium Mud Crabs from Our Farm'),
            ('hero_subtitle', 'We raise and harvest fresh mud crabs right here in Andhra Pradesh — cleaned, packed, and delivered to your door within 48 hours of harvest.'),
            ('story_title', 'A Few Months of Passion for Farming'),
            ('story_desc', 'We started our crab farm with a simple goal — to raise the freshest mud crabs and bring them straight to your kitchen, with no middleman, no compromise.')
        ]
        cur.executemany("""
            INSERT INTO settings (`key`, `value`)
            VALUES (%s, %s);
        """, default_settings)

    print("MySQL database initialization completed successfully!")
    cur.close()
    conn.close()
    return True

if __name__ == '__main__':
    initialize_database()
