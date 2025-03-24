from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib
import hmac
import time
import os
from typing import Optional
import json

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Would be stored in a database in production
LICENSE_SECRET = os.environ.get("LICENSE_SECRET", "your-secret-key-here")

class LicenseVerifyRequest(BaseModel):
    licenseKey: str

class LicenseVerifyResponse(BaseModel):
    valid: bool
    message: Optional[str] = None
    validUntil: Optional[int] = None
    type: Optional[str] = None

def verify_license_key(key: str):
    """
    Verify if a license key is valid
    In production, you would check against a database
    """
    # Simple example - in production use a proper database
    try:
        # Key format: PREFIX-TYPE-TIMESTAMP-HMAC
        parts = key.split('-')
        if len(parts) != 4 or parts[0] != 'GEAR':  # Gmail Email Attachment Renamer
            return False, "Invalid license key format", None, None
        
        license_type = parts[1]  # 'M' for monthly, 'L' for lifetime
        timestamp = int(parts[2])
        signature = parts[3]
        
        # Verify signature
        message = f"{parts[0]}-{parts[1]}-{parts[2]}"
        expected_sig = hmac.new(
            LICENSE_SECRET.encode(), 
            message.encode(), 
            hashlib.sha256
        ).hexdigest()[:10]
        
        if signature != expected_sig:
            return False, "Invalid license signature", None, None
        
        # Determine expiration based on license type
        current_time = int(time.time())
        
        if license_type == 'L':  # Lifetime
            valid_until = current_time + (10 * 365 * 24 * 60 * 60)  # 10 years
            license_type_str = "lifetime"
        elif license_type == 'M':  # Monthly
            valid_until = timestamp + (30 * 24 * 60 * 60)  # 30 days from purchase
            license_type_str = "monthly"
            
            # Check if expired for monthly licenses
            if current_time > valid_until:
                return False, "License has expired", None, None
        else:
            return False, "Unknown license type", None, None
            
        return True, "License is valid", valid_until * 1000, license_type_str  # Convert to milliseconds for JS
        
    except Exception as e:
        return False, f"Error verifying license: {str(e)}", None, None

@app.post("/verify", response_model=LicenseVerifyResponse)
async def verify_license(request: LicenseVerifyRequest):
    valid, message, valid_until, license_type = verify_license_key(request.licenseKey)
    
    return {
        "valid": valid,
        "message": message,
        "validUntil": valid_until,
        "type": license_type
    }

# For testing - generate a license key
@app.get("/generate/{license_type}")
async def generate_license(license_type: str):
    if license_type not in ['monthly', 'lifetime']:
        raise HTTPException(status_code=400, detail="License type must be 'monthly' or 'lifetime'")
    
    timestamp = int(time.time())
    type_code = 'M' if license_type == 'monthly' else 'L'
    
    message = f"GEAR-{type_code}-{timestamp}"
    signature = hmac.new(
        LICENSE_SECRET.encode(), 
        message.encode(), 
        hashlib.sha256
    ).hexdigest()[:10]
    
    license_key = f"{message}-{signature}"
    
    return {"license_key": license_key, "type": license_type}

# Health check endpoint
@app.get("/")
async def root():
    return {"status": "ok", "service": "Gmail Attachment Renamer License API"} 