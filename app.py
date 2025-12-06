import os
import secrets
import datetime
import json
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import psycopg2
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from flask_mail import Mail, Message
from contextlib import contextmanager
import threading

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "super_secret_key")
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(minutes=10)

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
AES_KEY = os.getenv("AES_KEY").encode()
cipher_suite = Fernet(AES_KEY)

# Mail Configuration
app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER')
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')

mail = Mail(app)

# DB Connection - Direct connection for Serverless/Vercel compatibility
# Relying on Neon's server-side pooler (in DATABASE_URL) for performance
@contextmanager
def get_db_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        yield conn
    finally:
        if 'conn' in locals() and conn:
            conn.close()

def init_db():
    with get_db_connection() as conn:
        cur = conn.cursor()
        
        # Users Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                is_verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # OTP Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS otp_codes (
                email VARCHAR(255) PRIMARY KEY,
                otp_code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            );
        """)
        
        # Passwords Vault Table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS vault_items (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                site_name VARCHAR(255) NOT NULL,
                site_username VARCHAR(255) NOT NULL,
                encrypted_password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        conn.commit()
        cur.close()

# Initialize DB
try:
    init_db()
    print("Database initialized successfully.")
except Exception as e:
    print(f"Error initializing database: {e}")

# --- Helpers ---
def generate_otp():
    return str(secrets.randbelow(1000000)).zfill(6)

def send_otp_email(email, otp):
    try:
        msg = Message("Your Password Manager OTP",
                      sender=app.config['MAIL_USERNAME'],
                      recipients=[email])
        msg.body = f"Your OTP code is: {otp}\n\nThis code expires in 10 minutes."
        
        # In Serverless (Vercel), background threads are unreliable.
        # We must send synchronously to ensure the email actually goes out
        # before the function execution freezes.
        mail.send(msg)
        print(f"OTP sent synchronously to {email}")
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

# API: Register & OTP
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({"error": "Missing fields"}), 400
        
    with get_db_connection() as conn:
        cur = conn.cursor()
        
        # Check if user exists
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        existing_user = cur.fetchone()
        
        if existing_user and existing_user['is_verified']:
            # conn returned to pool automatically
            return jsonify({"error": "User already exists"}), 400
            
        # Generate OTP
        otp = generate_otp()
        expires_at = datetime.datetime.now() + datetime.timedelta(minutes=10)
        
        # Upsert OTP
        cur.execute("""
            INSERT INTO otp_codes (email, otp_code, expires_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (email) 
            DO UPDATE SET otp_code = EXCLUDED.otp_code, expires_at = EXCLUDED.expires_at;
        """, (email, otp, expires_at))
        
        # If user doesn't exist, create unverified user
        password_hash = generate_password_hash(password, method='pbkdf2:sha256')
        
        if not existing_user:
            cur.execute("INSERT INTO users (email, password_hash) VALUES (%s, %s)", (email, password_hash))
        else:
            # Update existing unverified user
            cur.execute("UPDATE users SET password_hash = %s WHERE email = %s", (password_hash, email))
            
        conn.commit()
    
    if send_otp_email(email, otp):
        return jsonify({"message": "OTP sent to email", "status": "otp_sent"})
    else:
        return jsonify({"error": "Failed to send OTP email"}), 500

@app.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json
    email = data.get('email')
    otp = data.get('otp')
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM otp_codes WHERE email = %s", (email,))
        record = cur.fetchone()
        
        if not record or record['otp_code'] != otp:
            return jsonify({"error": "Invalid OTP"}), 400
            
        if datetime.datetime.now() > record['expires_at']:
            return jsonify({"error": "OTP Expired"}), 400
            
        # Verify User
        cur.execute("UPDATE users SET is_verified = TRUE WHERE email = %s RETURNING id", (email,))
        user_id = cur.fetchone()['id']
        
        # Cleanup OTP
        cur.execute("DELETE FROM otp_codes WHERE email = %s", (email,))
        
        conn.commit()
    
    return jsonify({"message": "Account verified", "success": True})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        
        cur.execute("SELECT * FROM users WHERE email = %s", (email,))
        user = cur.fetchone()
    
    if user and user['is_verified'] and check_password_hash(user['password_hash'], password):
        session.permanent = True
        session['user_id'] = user['id']
        session['email'] = user['email']
        # Hard 10 minute limit from right now
        session['expires_at'] = (datetime.datetime.now() + datetime.timedelta(minutes=10)).timestamp()
        return jsonify({"message": "Login successful", "success": True})
        
    return jsonify({"error": "Invalid credentials or unverified account"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})

@app.before_request
def check_session_expiry():
    if 'user_id' in session and 'expires_at' in session:
        now = datetime.datetime.now().timestamp()
        if now > session['expires_at']:
            session.clear()

@app.route('/api/check-session', methods=['GET'])
def check_session():
    if 'user_id' in session:
        remaining = 0
        if 'expires_at' in session:
            remaining = session['expires_at'] - datetime.datetime.now().timestamp()
        
        return jsonify({"logged_in": True, "email": session['email'], "remaining_seconds": remaining})
    return jsonify({"logged_in": False})

# --- Vault API ---

@app.route('/api/passwords', methods=['GET'])
def get_passwords():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_id = session['user_id']
    user_id = session['user_id']
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vault_items WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
    
    passwords = []
    for row in rows:
        decrypted_pw = cipher_suite.decrypt(row['encrypted_password'].encode()).decode()
        passwords.append({
            "id": row['id'],
            "siteName": row['site_name'],
            "username": row['site_username'],
            "password": decrypted_pw
        })
        
    return jsonify(passwords)

@app.route('/api/passwords', methods=['POST'])
def add_password():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_id = session['user_id']
    data = request.json
    
    site_name = data.get('siteName')
    username = data.get('username')
    raw_password = data.get('password')
    
    encrypted_pw = cipher_suite.encrypt(raw_password.encode()).decode()
    

    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO vault_items (user_id, site_name, site_username, encrypted_password)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (user_id, site_name, username, encrypted_pw))
        new_id = cur.fetchone()['id']
        conn.commit()
    
    return jsonify({"success": True, "id": new_id})

@app.route('/api/passwords/<int:item_id>', methods=['PUT'])
def update_password(item_id):
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_id = session['user_id']
    data = request.json
    
    raw_password = data.get('password')
    site_name = data.get('siteName')
    username = data.get('username')
    
    encrypted_pw = cipher_suite.encrypt(raw_password.encode()).decode()
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
            UPDATE vault_items 
            SET site_name = %s, site_username = %s, encrypted_password = %s
            WHERE id = %s AND user_id = %s
        """, (site_name, username, encrypted_pw, item_id, user_id))
        conn.commit()
    
    return jsonify({"success": True})

@app.route('/api/passwords/<int:item_id>', methods=['DELETE'])
def delete_password(item_id):
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
        
    user_id = session['user_id']
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM vault_items WHERE id = %s AND user_id = %s", (item_id, user_id))
        conn.commit()
    
    return jsonify({"success": True})

@app.route('/api/change-password', methods=['POST'])
def change_password():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    old_password = data.get('oldPassword')
    new_password = data.get('newPassword')
    
    user_id = session['user_id']
    
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cur.fetchone()
        
        if not check_password_hash(user['password_hash'], old_password):
            return jsonify({"error": "Incorrect old password"}), 400
            
        new_hash = generate_password_hash(new_password, method='pbkdf2:sha256')
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s", (new_hash, user_id))
        conn.commit()
        
    return jsonify({"success": True})



if __name__ == '__main__':
    app.run(debug=True, port=8000)
