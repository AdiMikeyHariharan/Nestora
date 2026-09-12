// Per-route <head> management. index.html carries the defaults; these hooks give
// each route its own title/description/canonical (Google renders JS, so it sees them)
// and let the property page publish structured data for its listing.
import { useEffect } from "react";

const SITE = "https://www.nestora.properties";
const DEFAULT_TITLE = "Nestora — Buy, Rent & Sell Homes in India | Verified Listings";
const DEFAULT_DESC =
  "Nestora is India's smart property platform — search verified flats, houses and plots to buy or rent with AI landmark search, maps, price/sqft insights and free owner listings.";

function setMeta(selector, attr, value, create) {
  let tag = document.head.querySelector(selector);
  if (!tag) { tag = create(); document.head.appendChild(tag); }
  tag.setAttribute(attr, value);
}

/**
 * Sets the page title, meta description and canonical for a route.
 * Pass `noIndex` for pages that shouldn't be indexed (e.g. 404).
 */
export function usePageMeta({ title, description, noIndex } = {}) {
  useEffect(() => {
    document.title = title ? `${title} | Nestora` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESC;

    setMeta('meta[name="description"]', "content", desc,
      () => Object.assign(document.createElement("meta"), { name: "description" }));
    setMeta('meta[property="og:title"]', "content", title ? `${title} | Nestora` : DEFAULT_TITLE,
      () => { const m = document.createElement("meta"); m.setAttribute("property", "og:title"); return m; });
    setMeta('meta[property="og:description"]', "content", desc,
      () => { const m = document.createElement("meta"); m.setAttribute("property", "og:description"); return m; });
    setMeta('link[rel="canonical"]', "href", SITE + window.location.pathname,
      () => Object.assign(document.createElement("link"), { rel: "canonical" }));
    setMeta('meta[name="robots"]', "content", noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
      () => Object.assign(document.createElement("meta"), { name: "robots" }));
  }, [title, description, noIndex]);
}

/** Injects a JSON-LD <script> for the lifetime of the component. */
export function useJsonLd(data) {
  useEffect(() => {
    if (!data) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.text = JSON.stringify(data);
    document.head.appendChild(el);
    return () => el.remove();
  }, [JSON.stringify(data)]);
}

/** schema.org description of a single listing. */
export function propertyJsonLd(p) {
  const isRent = p.type === "rent";
  const residence = /apartment|studio|flat/i.test(p.title) ? "Apartment" : "SingleFamilyResidence";
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    url: `${SITE}/property/${p.id}`,
    description: p.desc,
    ...(p.img ? { image: p.img } : {}),
    ...(p.createdAt ? { datePosted: p.createdAt } : {}),
    offers: {
      "@type": "Offer",
      price: p.priceINR,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      businessFunction: isRent
        ? "http://purl.org/goodrelations/v1#LeaseOut"
        : "http://purl.org/goodrelations/v1#Sell"
    },
    about: {
      "@type": residence,
      name: p.title,
      ...(p.beds ? { numberOfBedrooms: p.beds } : {}),
      ...(p.baths ? { numberOfBathroomsTotal: p.baths } : {}),
      ...(p.sqft ? { floorSize: { "@type": "QuantitativeValue", value: p.sqft, unitCode: "FTK" } } : {}),
      address: {
        "@type": "PostalAddress",
        addressLocality: p.area,
        addressRegion: p.city,
        postalCode: p.pincode,
        addressCountry: "IN"
      },
      ...(p.lat != null && p.lng != null
        ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } }
        : {})
    }
  };
}
