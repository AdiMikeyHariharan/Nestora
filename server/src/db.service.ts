// Data layer. DATABASE_URL points at local Postgres by default — swap it for
// your Supabase project's connection string (Settings → Database) to go hosted.
import 'dotenv/config';
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import * as crypto from "node:crypto";
import { Resend } from "resend";

@Injectable()
export class DbService implements OnModuleInit {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://localhost:5433/nestora",
    // Supabase requires SSL; local Postgres doesn't.
    ssl: process.env.DATABASE_URL?.includes("supabase") ? { rejectUnauthorized: false } : undefined
  });

  q(text: string, params?: any[]) { return this.pool.query(text, params); }

  async onModuleInit() {
    await this.q(`
      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY, name TEXT, password TEXT, role TEXT, phone TEXT,
        verified BOOLEAN DEFAULT FALSE, otp TEXT, otp_expires BIGINT, created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ DEFAULT now());
      CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY, title TEXT, type TEXT, category TEXT,
        city TEXT, area TEXT, pincode TEXT, price_inr BIGINT,
        beds REAL, baths INT, sqft INT, description TEXT,
        img TEXT, photos JSONB DEFAULT '[]', video TEXT,
        posted_by TEXT, role TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE properties ADD COLUMN IF NOT EXISTS furnishing TEXT DEFAULT 'unfurnished';
      DO $$ BEGIN
        IF (SELECT data_type FROM information_schema.columns WHERE table_name='properties' AND column_name='beds') = 'integer' THEN
          ALTER TABLE properties ALTER COLUMN beds TYPE REAL;
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS shortlist (email TEXT, property_id TEXT, PRIMARY KEY (email, property_id));
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, email TEXT, property_id TEXT, date_pref TEXT,
        status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY, email TEXT, booking_id TEXT, description TEXT,
        amount INT, status TEXT DEFAULT 'unpaid', method TEXT, gateway_ref TEXT,
        created_at TIMESTAMPTZ DEFAULT now(), paid_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY, session TEXT, who TEXT, text TEXT, created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages (session, id);
      
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
      
      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        property_id TEXT,
        buyer_email TEXT,
        seller_email TEXT,
        chat_summary TEXT,
        confidence_rating INT,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    await this.seed();
  }

  private async seed() {
    // Refresh the seed catalogue on each boot — removes old seed rows (incl. the
    // earlier demo listings) and leaves any user-posted listings untouched.
    await this.q("DELETE FROM properties WHERE posted_by = 'seed'");
    // Real listings (Eken Properties, exported from 99acres). Columns:
    // [id, title, type, category, city, area, pincode, price_inr, beds, baths, sqft, description, lat, lng, img]
    // BHK/baths are estimated from built-up area where the source export omitted them;
    // land/commercial are 0 BHK. Land sizes (cents/acres) are converted to sqft.
    const seeds: any[][] = [
      ["eken-B93112300","4 BHK Villa in Sobha Verdure","buy","resale","Coimbatore","Veerakeralam","641007",21000000,4,3,2206,"Independent House/Villa at Sobha Verdure, Veerakeralam, Coimbatore. Built-up area 2206 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref B93112300).",11.051,76.908,"https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=70"],
      ["eken-K93111192","1 BHK Villa in Sree Dakshas Ivadvi","buy","resale","Coimbatore","Vadavalli","641041",45000000,1,1,16,"Independent House/Villa at Sree Dakshas Ivadvi, Vadavalli, Coimbatore. Built-up area 16 sqft. Approx 1 BHK, 1 bath. Listed by Eken Properties (ref K93111192).",11.029,76.888,"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=70"],
      ["eken-B93108864","Office Space in Avarampalayam","buy","resale","Coimbatore","Avarampalayam","641006",110000000,0,0,5200,"Bare Shell Office Space, Avarampalayam, Coimbatore. Built-up area 5200 sqft. Listed by Eken Properties (ref B93108864).",11.033,76.972,"https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70"],
      ["eken-K93105154","Warehouse in Irugur","buy","resale","Coimbatore","Irugur","641103",110000000,0,0,30492,"WareHouse, Irugur, Coimbatore. Built-up area 70 cents (~30,492 sqft). Listed by Eken Properties (ref K93105154).",11.018,77.063,"https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"],
      ["eken-D92488210","4 BHK Villa in Sundakkamuthur","buy","resale","Coimbatore","Sundakkamuthur","641010",7000000,4,3,2400,"Independent House/Villa, Sundakkamuthur, Coimbatore. Built-up area 2400 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref D92488210).",10.956,76.93,"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=70"],
      ["eken-E92362004","3 BHK Apartment in Senthil Golden Gate 2","buy","resale","Coimbatore","Saravanampatti","641035",12500000,3,2,1594,"Residential Apartment at Senthil Golden Gate 2, Saravanampatti, Coimbatore. Built-up area 1594 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref E92362004).",11.079,77.001,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"],
      ["eken-K92307686","Plot in Vadavalli","buy","resale","Coimbatore","Vadavalli","641041",6000000,0,0,1307,"Residential Land/Plot, Vadavalli, Coimbatore. Plot area 3 cents (~1,307 sqft). Listed by Eken Properties (ref K92307686).",11.029,76.888,"https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=70"],
      ["eken-F92307632","3 BHK Villa in Vadavalli","buy","resale","Coimbatore","Vadavalli","641041",13000000,3,2,1307,"Independent House/Villa, Vadavalli, Coimbatore. Built-up area 3 cents (~1,307 sqft). Approx 3 BHK, 2 bath. Listed by Eken Properties (ref F92307632).",11.029,76.888,"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=70"],
      ["eken-J92307432","4 BHK Villa in Sundakkamuthur","buy","resale","Coimbatore","Sundakkamuthur","641010",9500000,4,3,2100,"Independent House/Villa, Sundakkamuthur, Coimbatore. Built-up area 2100 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref J92307432).",10.956,76.93,"https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=70"],
      ["eken-V92307300","4 BHK Villa in Kovaipudur","buy","resale","Coimbatore","Kovaipudur","641042",14500000,4,3,2471,"Independent House/Villa, Kovaipudur, Coimbatore. Built-up area 2471 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref V92307300).",10.942,76.92,"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=70"],
      ["eken-A89014368","Showroom in Saibaba Colony","rent","resale","Coimbatore","Saibaba Colony","641011",210000,0,0,2400,"Commercial Showrooms, Saibaba Colony, Coimbatore. Built-up area 2400 sqft. Listed by Eken Properties (ref A89014368).",11.023,76.945,"https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=70"],
      ["eken-T87098396","Office Space in Sungam","rent","resale","Coimbatore","Sungam","641045",100000,0,0,3460,"Ready to move Office Space, Sungam, Coimbatore. Built-up area 3460 sqft. Listed by Eken Properties (ref T87098396).",10.993,76.976,"https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70"],
      ["eken-C89014646","1 BHK Studio in Town Teknopolis","buy","resale","Coimbatore","Chinnavedampatti","641049",2000000,1,1,94,"Studio Apartment at Town Teknopolis, Chinnavedampatti, Coimbatore. Built-up area 94 sqft. Approx 1 BHK, 1 bath. Listed by Eken Properties (ref C89014646).",11.068,76.999,"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=70"],
      ["eken-M89014848","5 BHK Villa in TAPOVAN SENIOR CITIZEN HOME","buy","resale","Coimbatore","Vadavalli","641041",25000000,5,4,6400,"Independent House/Villa at TAPOVAN SENIOR CITIZEN HOME, Vadavalli, Coimbatore. Built-up area 6400 sqft. Approx 5 BHK, 4 bath. Listed by Eken Properties (ref M89014848).",11.029,76.888,"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=70"],
      ["eken-K77918395","Plot in Elysium Casa Del Sol","buy","resale","Coimbatore","Fathima Nagar","641045",35200000,0,0,7210,"Residential Land/Plot at Elysium Casa Del Sol, Fathima Nagar, Coimbatore. Plot area 7210 sqft. Listed by Eken Properties (ref K77918395).",10.988,76.956,"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=70"],
      ["eken-P81790702","5 BHK Villa in Sree Dakshas Ivadvi","buy","resale","Coimbatore","Vadavalli","641041",45000000,5,4,7840,"Independent House/Villa at Sree Dakshas Ivadvi, Vadavalli, Coimbatore. Built-up area 7840 sqft. Approx 5 BHK, 4 bath. Listed by Eken Properties (ref P81790702).",11.029,76.888,"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=70"],
      ["eken-W81483441","Co-working Space in RS Puram","buy","resale","Coimbatore","RS Puram","641002",72500000,0,0,2668,"Co-working Office Space, RS Puram, Coimbatore. Built-up area 2668 sqft. Listed by Eken Properties (ref W81483441).",11.008,76.949,"https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"],
      ["eken-Z89038296","Plot in Perur Chettipalayam","buy","resale","Coimbatore","Perur Chettipalayam","641010",5500000,0,0,1800,"Residential Land/Plot, Perur Chettipalayam, Coimbatore. Plot area 1800 sqft. Listed by Eken Properties (ref Z89038296).",10.972,76.89,"https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=800&q=70"],
      ["eken-C89137955","Plot in Perur Chettipalayam","buy","resale","Coimbatore","Perur Chettipalayam","641010",300000000,0,0,304920,"Residential Land/Plot, Perur Chettipalayam, Coimbatore. Plot area 7 acres (~3,04,920 sqft). Listed by Eken Properties (ref C89137955).",10.972,76.89,"https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=70"],
      ["eken-V89039504","4 BHK Apartment in Mithila","buy","resale","Coimbatore","R S Puram","641002",25000000,4,3,2510,"Residential Apartment at Mithila, R S Puram, Coimbatore. Built-up area 2510 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref V89039504).",11.008,76.949,"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=70"],
      ["eken-Z89037512","3 BHK Villa in Anandhamayam Senior Living","buy","resale","Coimbatore","Vadavalli","641041",9500000,3,2,1307,"Independent House/Villa at Anandhamayam Senior Living, Vadavalli, Coimbatore. Built-up area 3 cents (~1,307 sqft). Approx 3 BHK, 2 bath. Listed by Eken Properties (ref Z89037512).",11.029,76.888,"https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=70"],
      ["eken-N89344061","3 BHK Apartment in Classic Garden","buy","resale","Coimbatore","Trichy Road","641005",9000000,3,2,1467,"Residential Apartment at Classic Garden, Trichy Road, Coimbatore. Built-up area 1467 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref N89344061).",10.993,76.976,"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=70"],
      ["eken-C77840021","4 BHK Apartment in Akshaya Orbit 11","buy","resale","Coimbatore","Gopalapuram","641018",23000000,4,3,2297,"Residential Apartment at Akshaya Orbit 11, Gopalapuram, Coimbatore. Built-up area 2297 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref C77840021).",11.017,76.974,"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=70"],
      ["eken-S89608690","4 BHK Apartment in Sri Gujans Annapoorna","buy","resale","Coimbatore","Vadavalli","641041",10000000,4,3,1687,"Residential Apartment at Sri Gujans Annapoorna, Vadavalli, Coimbatore. Built-up area 1687 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref S89608690).",11.029,76.888,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"],
      ["eken-V74532783","3 BHK Villa in Pioneer Apartments","buy","resale","Coimbatore","Avinashi Road","641018",7500000,3,2,1250,"Independent House/Villa at Pioneer Apartments, Avinashi Road, Coimbatore. Built-up area 1250 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref V74532783).",11.023,77.001,"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=70"],
      ["eken-X74522985","3 BHK Apartment in Jayalakshmie Aishwaryam","buy","resale","Coimbatore","Saibaba Colony","641011",7500000,3,2,1299,"Residential Apartment at Jayalakshmie Aishwaryam, Saibaba Colony, Coimbatore. Built-up area 1299 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref X74522985).",11.023,76.945,"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=70"],
      ["eken-X92199336","2 BHK Apartment in Gujans Skandapurvaja","buy","resale","Coimbatore","Chinmaya Nagar","641050",5500000,2,1,779,"Residential Apartment at Gujans Skandapurvaja, Chinmaya Nagar, Coimbatore. Built-up area 779 sqft. Approx 2 BHK, 1 bath. Listed by Eken Properties (ref X92199336).",11.045,77.008,"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=70"],
      ["eken-A85518192","2 BHK Apartment in Rakindo Orchids","buy","resale","Coimbatore","Kovaipudur","641042",4500000,2,1,960,"Residential Apartment at Rakindo Orchids, Kovaipudur, Coimbatore. Built-up area 960 sqft. Approx 2 BHK, 1 bath. Listed by Eken Properties (ref A85518192).",10.942,76.92,"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=70"],
      ["eken-V92160960","Plot in Irugur","buy","resale","Coimbatore","Irugur","641103",110000000,0,0,30492,"Residential Land/Plot, Irugur, Coimbatore. Plot area 70 cents (~30,492 sqft). Listed by Eken Properties (ref V92160960).",11.018,77.063,"https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=800&q=70"],
      ["eken-V92160942","1 BHK Apartment in KG Smart City Apartment","buy","resale","Coimbatore","Vilankurichi","641035",5500000,1,1,513,"Residential Apartment at KG Smart City Apartment, Vilankurichi, Coimbatore. Built-up area 513 sqft. Approx 1 BHK, 1 bath. Listed by Eken Properties (ref V92160942).",11.062,77.013,"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=70"],
      ["eken-B78145311","4 BHK Villa in Sobha Verdure","buy","resale","Coimbatore","Veerakeralam","641007",22500000,4,3,1749,"Independent House/Villa at Sobha Verdure, Veerakeralam, Coimbatore. Built-up area 1749 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref B78145311).",11.051,76.908,"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=70"],
      ["eken-O92160920","3 BHK Apartment in Kirthika Apartments","buy","resale","Chennai","Karthikeyapuram","600091",9000000,3,2,1219,"Residential Apartment at Kirthika Apartments, Karthikeyapuram, Chennai. Built-up area 1219 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref O92160920).",12.962,80.198,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"],
      ["eken-H92160898","3 BHK Apartment in Vijay Icon","buy","resale","Bengaluru","Kammasandra","560100",8500000,3,2,1415,"Residential Apartment at Vijay Icon, Kammasandra, Bengaluru. Built-up area 1415 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref H92160898).",12.846,77.69,"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=70"],
      ["eken-O92160862","3 BHK Apartment in Featherlite Vaikuntam","buy","resale","Chennai","Guduvancheri","603202",7500000,3,2,1317,"Residential Apartment at Featherlite Vaikuntam, Guduvancheri, Chennai. Built-up area 1317 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref O92160862).",12.844,80.059,"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=70"],
      ["eken-V77918845","4 BHK Villa in Vensa Nivriti Blissful Homes","buy","resale","Coimbatore","Avinashi Road","641018",22000000,4,3,1742,"Independent House/Villa at Vensa Nivriti Blissful Homes, Avinashi Road, Coimbatore. Built-up area 4 cents (~1,742 sqft). Approx 4 BHK, 3 bath. Listed by Eken Properties (ref V77918845).",11.023,77.001,"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=70"],
      ["eken-N81607455","1 BHK Apartment in Patteeswarar Apartments","buy","resale","Coimbatore","Saibaba Colony","641011",4500000,1,1,600,"Residential Apartment at Patteeswarar Apartments, Saibaba Colony, Coimbatore. Built-up area 600 sqft. Approx 1 BHK, 1 bath. Listed by Eken Properties (ref N81607455).",11.023,76.945,"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=70"],
      ["eken-I89014236","2 BHK Apartment in Sri Gujans Annapoorna","buy","resale","Coimbatore","Vadavalli","641041",6200000,2,1,1040,"Residential Apartment at Sri Gujans Annapoorna, Vadavalli, Coimbatore. Built-up area 1040 sqft. Approx 2 BHK, 1 bath. Listed by Eken Properties (ref I89014236).",11.029,76.888,"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=70"],
      ["eken-Q87781378","3 BHK Apartment in Raheja Centre","buy","resale","Coimbatore","Avinashi Road","641018",6800000,3,2,1125,"Residential Apartment at Raheja Centre, Avinashi Road, Coimbatore. Built-up area 1125 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref Q87781378).",11.023,77.001,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"],
      ["eken-T89014478","Plot in Irugur","buy","resale","Coimbatore","Irugur","641103",120000000,0,0,30492,"Residential Land/Plot, Irugur, Coimbatore. Plot area 70 cents (~30,492 sqft). Listed by Eken Properties (ref T89014478).",11.018,77.063,"https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=800&q=70"],
      ["eken-Q85106464","4 BHK Villa in Singanallur","buy","resale","Coimbatore","Singanallur","641005",23000000,4,3,2400,"Independent House/Villa, Singanallur, Coimbatore. Built-up area 2400 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref Q85106464).",11.005,77.029,"https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=70"],
      ["eken-Y89039376","3 BHK Villa in Ultra Homes","buy","resale","Coimbatore","Sulur","641402",17500000,3,2,1307,"Independent House/Villa at Ultra Homes, Sulur, Coimbatore. Built-up area 3 cents (~1,307 sqft). Approx 3 BHK, 2 bath. Listed by Eken Properties (ref Y89039376).",11.025,77.127,"https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=70"],
      ["eken-X85786330","4 BHK Villa in Kovaipudur","buy","resale","Coimbatore","Kovaipudur","641042",15000000,4,3,2000,"Independent House/Villa, Kovaipudur, Coimbatore. Built-up area 2000 sqft. Approx 4 BHK, 3 bath. Listed by Eken Properties (ref X85786330).",10.942,76.92,"https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=70"],
      ["eken-Q78764089","5 BHK Villa in Manchester Cotton City","buy","resale","Coimbatore","Vellakinar","641029",65000000,5,4,4116,"Independent House/Villa at Manchester Cotton City, Vellakinar, Coimbatore. Built-up area 4116 sqft. Approx 5 BHK, 4 bath. Listed by Eken Properties (ref Q78764089).",11.085,76.95,"https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=70"],
      ["eken-I80637203","3 BHK Apartment in Pioneer Apartments","buy","resale","Coimbatore","Avinashi Road","641018",10500000,3,2,1560,"Residential Apartment at Pioneer Apartments, Avinashi Road, Coimbatore. Built-up area 1560 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref I80637203).",11.023,77.001,"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=70"],
      ["eken-C89137753","2 BHK Apartment in Rakindo Orchids","buy","resale","Coimbatore","Kovaipudur","641042",2800000,2,1,672,"Residential Apartment at Rakindo Orchids, Kovaipudur, Coimbatore. Built-up area 672 sqft. Approx 2 BHK, 1 bath. Listed by Eken Properties (ref C89137753).",10.942,76.92,"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=70"],
      ["eken-G89138221","Plot in Kodanad","buy","resale","Nilgiris","Kodanad","643207",12500000,0,0,21780,"Residential Land/Plot, Kodanad, Nilgiris. Plot area 50 cents (~21,780 sqft). Listed by Eken Properties (ref G89138221).",11.46,76.83,"https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=70"],
      ["eken-B89223355","Shop in Commercial Building and Road","buy","resale","Coimbatore","Avarampalayam","641006",110000000,0,0,7400,"Commercial Shops at Commercial Building and Road, Avarampalayam, Coimbatore. Built-up area 7400 sqft. Listed by Eken Properties (ref B89223355).",11.033,76.972,"https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=70"],
      ["eken-I87759902","3 BHK Apartment in Globus Arima Legend","buy","resale","Coimbatore","Nava India","641028",23000000,3,2,1383,"Residential Apartment at Globus Arima Legend, Nava India, Coimbatore. Built-up area 1383 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref I87759902).",11.034,77,"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=70"],
      ["eken-Y89344139","3 BHK Apartment in CBOU Grand Hills Apartments","buy","resale","Coimbatore","Kovaipudur","641042",5200000,3,2,1159,"Residential Apartment at CBOU Grand Hills Apartments, Kovaipudur, Coimbatore. Built-up area 1159 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref Y89344139).",10.942,76.92,"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=70"],
      ["eken-U89606258","3 BHK Apartment in Rakindo Orchids","buy","resale","Coimbatore","Kovaipudur","641042",7000000,3,2,1185,"Residential Apartment at Rakindo Orchids, Kovaipudur, Coimbatore. Built-up area 1185 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref U89606258).",10.942,76.92,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"],
      ["eken-C90441736","3 BHK Apartment in AP Apartment","buy","resale","Coimbatore","Sivananda Colony","641012",10000000,3,2,1430,"Residential Apartment at AP Apartment, Sivananda Colony, Coimbatore. Built-up area 1430 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref C90441736).",11.018,76.955,"https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=70"],
      ["eken-X89606822","3 BHK Apartment in Sri Gujans Annapoorna","buy","resale","Coimbatore","Vadavalli","641041",6000000,3,2,1185,"Residential Apartment at Sri Gujans Annapoorna, Vadavalli, Coimbatore. Built-up area 1185 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref X89606822).",11.029,76.888,"https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=70"],
      ["eken-V90372280","2 BHK Apartment in KK's JAI FLATS","buy","resale","Coimbatore","Vadavalli","641041",6200000,2,1,916,"Residential Apartment at KK's JAI FLATS, Vadavalli, Coimbatore. Built-up area 916 sqft. Approx 2 BHK, 1 bath. Listed by Eken Properties (ref V90372280).",11.029,76.888,"https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=70"],
      ["eken-O90501640","3 BHK Apartment in Senthil Golden Gate 3","buy","resale","Coimbatore","Saravanampatti","641035",10500000,3,2,1594,"Residential Apartment at Senthil Golden Gate 3, Saravanampatti, Coimbatore. Built-up area 1594 sqft. Approx 3 BHK, 2 bath. Listed by Eken Properties (ref O90501640).",11.079,77.001,"https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=70"],
      ["eken-L89014970","5 BHK Apartment in P And K West Gate","buy","resale","Coimbatore","Saravanampatti","641035",25000000,5,4,6135,"Residential Apartment at P And K West Gate, Saravanampatti, Coimbatore. Built-up area 6135 sqft. Approx 5 BHK, 4 bath. Listed by Eken Properties (ref L89014970).",11.079,77.001,"https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=70"]
    ];
    for (const s of seeds) {
      await this.q(`INSERT INTO properties (id,title,type,category,city,area,pincode,price_inr,beds,baths,sqft,description,lat,lng,img,posted_by,role)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'seed','seed')`, s);
    }
    console.log("Seeded", seeds.length, "properties");
  }

  // ---- auth helpers ----
  uid(prefix: string) { return prefix + "-" + crypto.randomBytes(6).toString("hex"); }

  hashPassword(pw: string) {
    const salt = crypto.randomBytes(12).toString("hex");
    return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
  }
  checkPassword(pw: string, stored: string) {
    const [salt, hash] = (stored || "").split(":");
    if (!salt || !hash) return false;
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), crypto.scryptSync(pw, salt, 32));
  }

  async userFromRequest(req: any) {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return null;
    const { rows } = await this.q(
      "SELECT u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = $1", [token]);
    return rows[0] || null;
  }

  async createSession(email: string) {
    const token = crypto.randomBytes(24).toString("hex");
    await this.q("INSERT INTO sessions (token,email) VALUES ($1,$2)", [token, email]);
    return token;
  }

  // Init only when a key is present; otherwise email logs to console so the
  // server still boots (local dev / unconfigured envs).
  resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  async sendEmail(to: string, subject: string, text: string) {
    console.log(`\n=== EMAIL to ${to} ===\n${subject}\n${text}\n====================\n`);
    if (!this.resend) return;

    try {
      await this.resend.emails.send({
        from: "Nestora <noreply@nestora.properties>",
        to: to,
        replyTo: "support@nestora.properties",
        subject: subject,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div style="background-color: #059669; padding: 15px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800;">Nestora</h1>
          </div>
          <div style="padding: 20px; color: #1e293b;">
            <p style="margin-top: 0; font-size: 16px;">${text.replace(/\n/g, "<br>")}</p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 12px; color: #64748b;">
            Nestora properties · Find your nest
          </div>
        </div>`
      });
    } catch (err) {
      console.error("Failed to send email via Resend SDK:", err);
    }
  }

  async issueOtp(email: string) {
    const otp = "" + crypto.randomInt(100000, 1000000);
    await this.q("UPDATE users SET otp = $1, otp_expires = $2 WHERE email = $3",
      [otp, Date.now() + 10 * 60 * 1000, email]);
    this.sendEmail(email, "Your Nestora verification code", `Your OTP is ${otp}. It expires in 10 minutes.`);
    return otp;
  }

  publicUser(u: any) { return { name: u.name, email: u.email, role: u.role, phone: u.phone, verified: !!u.verified }; }

  toApiProp(row: any) {
    const { price_inr, description, posted_by, created_at, ...rest } = row;
    return { ...rest, priceINR: Number(price_inr), desc: description, postedBy: posted_by, createdAt: created_at };
  }
}
