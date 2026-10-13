// Search sources for Creator Downloader. Each source turns a query into a list of items in one shared shape:
// { uid, source, type, title, thumb, preview, w, h, author, authorUrl, page, license, credit, variants | loadVariants(), watchOnly? }
// All requests go through the app (window.cd.json), so websites' browser restrictions don't block them.
export const keys = { pexels: "", pixabay: "", unsplash: "", youtube: "" };

const strip = h => { const d = document.createElement("div"); d.innerHTML = String(h ?? ""); return (d.textContent || "").trim(); };
const https = u => u ? String(u).replace(/^http:\/\//, "https://") : u;
export const qs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
export const ext = u => { const m = String(u).split("?")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : ""; };
async function getJSON(url, opts) {
  const r = await (await import("./bridge.js")).cd.json(url, opts?.headers);
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Key rejected" : r.status === 429 ? "Rate limited" : (r.error || "HTTP " + r.status));
  return r.data;
}

/* license class: nocredit (public domain, CC0, Pexels/Pixabay/Unsplash licenses), credit (CC BY / BY-SA), nc (non-commercial or no-derivatives) */
export function licClass(l) {
  const s = String(l || "").toLowerCase();
  if (/\bnc\b|non-?commercial|\bnd\b|noderiv/.test(s)) return "nc";
  if (/cc0|public domain|pdm|pexels|pixabay|unsplash|no known/.test(s)) return "nocredit";
  return "credit";
}
export const LIC_LABEL = { nocredit: "No credit", credit: "Credit", nc: "Restricted" };

export function pick(variants, pref) {
  const vs = [...variants].filter(v => v.url).sort((a, b) => (a.w || 0) - (b.w || 0));
  if (!vs.length) return null;
  if (pref === "original") return vs.at(-1);
  const max = { small: 800, medium: 1600, large: 2560 }[pref] || 2560;
  const fit = vs.filter(v => (v.w || 0) <= max && !/tiff?$/i.test(ext(v.url)));
  return fit.at(-1) || vs[0];
}

export const SOURCES = {
  openverse: {
    name: "Openverse", types: ["image"], key: null,
    async search(q, type, page) {
      const d = await getJSON("https://api.openverse.org/v1/images/?" + qs({ q, page, page_size: 20, mature: "false" }));
      return d.results.map(r => ({
        uid: "ov-" + r.id, source: "openverse", type: "image",
        title: r.title || q, thumb: r.thumbnail, w: r.width, h: r.height,
        author: r.creator, authorUrl: r.creator_url, page: r.foreign_landing_url,
        license: ("CC " + (r.license || "") + " " + (r.license_version || "")).toUpperCase().replace("CC PDM", "Public Domain Mark").replace("CC CC0", "CC0"),
        credit: r.attribution,
        variants: [{ label: "Preview", url: r.thumbnail, w: 600, h: 0 }, { label: "Original", url: r.url, w: r.width || 9999, h: r.height }]
      }));
    }
  },
  wikimedia: {
    name: "Wikimedia Commons", types: ["image", "video"], key: null,
    async search(q, type, page) {
      const want = type === "all" ? ["image", "video"] : [type];
      const per = type === "all" ? 12 : 24;
      const out = [];
      for (const t of want) {
        const isV = t === "video";
        const p = isV ? "vi" : "ii";
        const params = {
          action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: 6,
          gsrsearch: q + (isV ? " filetype:video" : " filetype:bitmap"), gsrlimit: per, gsroffset: (page - 1) * per,
          prop: isV ? "videoinfo" : "imageinfo",
          [p + "prop"]: "url|size|mime|extmetadata" + (isV ? "|derivatives" : ""), [p + "urlwidth"]: 640
        };
        const d = await getJSON("https://commons.wikimedia.org/w/api.php?" + qs(params));
        const pages = Object.values(d.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
        for (const pg of pages) {
          const info = (pg.imageinfo || pg.videoinfo || [])[0]; if (!info) continue;
          const m = info.extmetadata || {};
          const title = strip(m.ObjectName?.value) || pg.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
          let variants;
          if (isV) {
            variants = (info.derivatives || []).filter(x => x.width).map(x => ({ label: (x.height || "") + "p " + (x.type || "").split(";")[0].replace("video/", ""), url: x.src, w: x.width, h: x.height }));
            variants.push({ label: "Original", url: info.url, w: info.width || 9999, h: info.height });
          } else {
            variants = [];
            if (info.thumburl && info.width > 640) {
              for (const w of [640, 1280, 1920, 2560]) if (w < info.width) variants.push({ label: w + " px", url: info.thumburl.replace(/\/\d+px-/, "/" + w + "px-"), w, h: Math.round(info.height * w / info.width) });
            }
            variants.push({ label: "Original", url: info.url, w: info.width, h: info.height });
          }
          out.push({
            uid: "wm-" + pg.pageid, source: "wikimedia", type: t, title,
            thumb: info.thumburl || info.url, preview: isV ? (variants.find(v => v.h && v.h <= 480) || variants[0]).url : null,
            w: info.width, h: info.height, author: strip(m.Artist?.value), page: info.descriptionurl,
            license: strip(m.LicenseShortName?.value) || "See file page", variants
          });
        }
      }
      return out;
    }
  },
  nasa: {
    name: "NASA", types: ["image", "video"], key: null,
    async search(q, type, page) {
      const d = await getJSON("https://images-api.nasa.gov/search?" + qs({ q, page, page_size: 20, media_type: type === "all" ? "image,video" : type }));
      return (d.collection?.items || []).filter(it => it.data?.[0]).map(it => {
        const m = it.data[0];
        const thumb = https(it.links?.find(l => l.render === "image")?.href || it.links?.[0]?.href);
        return {
          uid: "nasa-" + m.nasa_id, source: "nasa", type: m.media_type === "video" ? "video" : "image",
          title: m.title, thumb, author: m.photographer || m.secondary_creator || m.center || "NASA",
          page: "https://images.nasa.gov/details/" + encodeURIComponent(m.nasa_id), license: "Public domain (NASA media guidelines)",
          variants: null,
          async loadVariants() {
            const files = (await getJSON(https(it.href))).map(https);
            const isV = m.media_type === "video";
            const order = isV ? ["~orig.mp4", "~large.mp4", "~medium.mp4", "~mobile.mp4", "~preview.mp4"] : ["~orig.", "~large.", "~medium.", "~small.", "~thumb."];
            const names = isV ? ["Original", "Large", "Medium", "Mobile", "Preview"] : ["Original", "Large", "Medium", "Small", "Thumb"];
            const tiers = [9999, 1920, 1280, 640, 320];
            const vs = [];
            order.forEach((tag, i) => { const f = files.find(u => u.toLowerCase().includes(tag)); if (f) vs.push({ label: names[i], url: f, w: tiers[i], h: 0, approx: i > 0 }); });
            if (!vs.length) files.filter(u => /\.(jpe?g|png|mp4|mov)$/i.test(u)).forEach(u => vs.push({ label: ext(u).toUpperCase(), url: u, w: 0, h: 0 }));
            return vs;
          }
        };
      });
    }
  },
  artic: {
    name: "Art Institute of Chicago", types: ["image"], key: null,
    async search(q, type, page) {
      const d = await getJSON("https://api.artic.edu/api/v1/artworks/search?" + qs({ q, page, limit: 20, "query[term][is_public_domain]": "true", fields: "id,title,image_id,artist_display,thumbnail" }));
      const base = d.config?.iiif_url || "https://www.artic.edu/iiif/2";
      return d.data.filter(a => a.image_id).map(a => {
        const tw = a.thumbnail?.width, th = a.thumbnail?.height;
        const at = w => ({ w, h: tw ? Math.round(th * w / tw) : 0 });
        return {
          uid: "aic-" + a.id, source: "artic", type: "image", title: a.title,
          thumb: `${base}/${a.image_id}/full/400,/0/default.jpg`, w: tw, h: th,
          author: (a.artist_display || "").split("\n")[0], page: "https://www.artic.edu/artworks/" + a.id, license: "CC0 (public domain)",
          variants: [
            { label: "Small", url: `${base}/${a.image_id}/full/400,/0/default.jpg`, ...at(400) },
            { label: "Standard", url: `${base}/${a.image_id}/full/843,/0/default.jpg`, ...at(843) },
            { label: "Large", url: `${base}/${a.image_id}/full/1686,/0/default.jpg`, ...at(1686) }
          ]
        };
      });
    }
  },
  cleveland: {
    name: "Cleveland Museum of Art", types: ["image"], key: null,
    async search(q, type, page) {
      const d = await getJSON("https://openaccess-api.clevelandart.org/api/artworks/?" + qs({ q, cc0: 1, has_image: 1, limit: 20, skip: (page - 1) * 20 }));
      return (d.data || []).filter(a => a.images?.web).map(a => {
        const im = a.images; const vs = [];
        if (im.web) vs.push({ label: "Web", url: im.web.url, w: +im.web.width, h: +im.web.height });
        if (im.print) vs.push({ label: "Print", url: im.print.url, w: +im.print.width, h: +im.print.height });
        if (im.full) vs.push({ label: "Full TIFF", url: im.full.url, w: +im.full.width, h: +im.full.height });
        return {
          uid: "cma-" + a.id, source: "cleveland", type: "image", title: a.title, thumb: im.web.url,
          w: +im.web.width, h: +im.web.height, author: a.creators?.[0]?.description || "", page: a.url, license: "CC0 (public domain)", variants: vs
        };
      });
    }
  },
  pexels: {
    name: "Pexels", types: ["image", "video"], key: "pexels",
    async search(q, type, page) {
      const H = { headers: { Authorization: keys.pexels } }; const out = [];
      if (type !== "video") {
        const d = await getJSON("https://api.pexels.com/v1/search?" + qs({ query: q, page, per_page: type === "all" ? 12 : 24 }), H);
        for (const p of d.photos) {
          const s = p.src, r = p.height / p.width;
          out.push({
            uid: "px-" + p.id, source: "pexels", type: "image", title: p.alt || q, thumb: s.medium, w: p.width, h: p.height,
            author: p.photographer, authorUrl: p.photographer_url, page: p.url, license: "Pexels License (free, no attribution required)",
            credit: `Photo by ${p.photographer} on Pexels`,
            variants: [
              { label: "Small", url: s.medium, w: Math.round(350 / r), h: 350 },
              { label: "Large", url: s.large2x, w: 1880, h: Math.round(1880 * r) },
              { label: "Original", url: s.original, w: p.width, h: p.height }
            ]
          });
        }
      }
      if (type !== "image") {
        const d = await getJSON("https://api.pexels.com/videos/search?" + qs({ query: q, page, per_page: type === "all" ? 10 : 20 }), H);
        for (const v of d.videos) {
          const files = v.video_files.filter(f => f.link && f.width).sort((a, b) => a.width - b.width);
          out.push({
            uid: "pxv-" + v.id, source: "pexels", type: "video", title: (v.url.match(/video\/([^/]+?)-\d+\/?$/)?.[1] || q).replace(/-/g, " "),
            thumb: v.image, preview: (files.find(f => f.width >= 480) || files[0])?.link, w: v.width, h: v.height,
            author: v.user?.name, authorUrl: v.user?.url, page: v.url, license: "Pexels License (free, no attribution required)",
            credit: `Video by ${v.user?.name} on Pexels`,
            variants: files.map(f => ({ label: (f.height ? Math.min(f.width, f.height) + "p" : f.quality) + (f.fps ? " · " + Math.round(f.fps) + "fps" : ""), url: f.link, w: f.width, h: f.height }))
          });
        }
      }
      return out;
    }
  },
  pixabay: {
    name: "Pixabay", types: ["image", "video"], key: "pixabay",
    async search(q, type, page) {
      const out = [];
      if (type !== "video") {
        const d = await getJSON("https://pixabay.com/api/?" + qs({ key: keys.pixabay, q, page, per_page: type === "all" ? 12 : 24, safesearch: "true" }));
        for (const h of d.hits) out.push({
          uid: "pb-" + h.id, source: "pixabay", type: "image", title: h.tags || q, thumb: h.webformatURL, w: h.imageWidth, h: h.imageHeight,
          author: h.user, authorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`, page: h.pageURL, license: "Pixabay Content License",
          credit: `Image by ${h.user} from Pixabay`,
          variants: [
            { label: "Medium", url: h.webformatURL, w: h.webformatWidth, h: h.webformatHeight },
            { label: "Large", url: h.largeImageURL, w: 1280, h: Math.round(1280 * h.imageHeight / h.imageWidth) },
            ...(h.imageURL ? [{ label: "Original", url: h.imageURL, w: h.imageWidth, h: h.imageHeight }] : [])
          ]
        });
      }
      if (type !== "image") {
        const d = await getJSON("https://pixabay.com/api/videos/?" + qs({ key: keys.pixabay, q, page, per_page: type === "all" ? 10 : 20, safesearch: "true" }));
        for (const h of d.hits) {
          const V = h.videos || {};
          const vs = ["tiny", "small", "medium", "large"].filter(k => V[k]?.url).map(k => ({ label: k[0].toUpperCase() + k.slice(1) + " " + V[k].height + "p", url: V[k].url, w: V[k].width, h: V[k].height }));
          out.push({
            uid: "pbv-" + h.id, source: "pixabay", type: "video", title: h.tags || q,
            thumb: V.medium?.thumbnail || V.small?.thumbnail || V.tiny?.thumbnail || (h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : ""),
            preview: (V.tiny || V.small)?.url, w: vs.at(-1)?.w, h: vs.at(-1)?.h,
            author: h.user, authorUrl: `https://pixabay.com/users/${h.user}-${h.user_id}/`, page: h.pageURL, license: "Pixabay Content License",
            credit: `Video by ${h.user} from Pixabay`, variants: vs
          });
        }
      }
      return out;
    }
  },
  archive: {
    name: "Internet Archive", types: ["video"], key: null,
    desc: "Free films, documentaries and stock footage you can download. Only Creative Commons and public-domain items are shown.",
    async search(q, type, page) {
      const query = `(${q}) AND mediatype:(movies) AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*)`;
      const url = "https://archive.org/advancedsearch.php?" + qs({ q: query, rows: 20, page, output: "json" }) + "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl";
      const d = await getJSON(url);
      return (d.response?.docs || []).map(doc => {
        const id = doc.identifier;
        const lu = String(doc.licenseurl || "");
        const m = lu.match(/licenses\/([a-z-]+)\//i);
        const license = /publicdomain/i.test(lu) ? (/zero/i.test(lu) ? "CC0" : "Public domain") : m ? "CC " + m[1].toUpperCase() : "Creative Commons";
        return {
          uid: "ia-" + id, source: "archive", type: "video", title: [].concat(doc.title || id)[0],
          thumb: "https://archive.org/services/img/" + encodeURIComponent(id),
          author: [].concat(doc.creator || "")[0], page: "https://archive.org/details/" + encodeURIComponent(id), license,
          variants: null,
          async loadVariants() {
            const meta = await getJSON("https://archive.org/metadata/" + encodeURIComponent(id));
            const files = (meta.files || []).filter(f => /\.(mp4|webm|ogv|mov|mpe?g|avi)$/i.test(f.name) && f.source !== "metadata");
            const vs = files.map(f => ({
              label: (f.format || ext(f.name).toUpperCase()) + (f.height ? " " + f.height + "p" : ""),
              url: `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
              w: +f.width || (/512kb/i.test(f.name) ? 640 : /h\.?264|mpeg4/i.test(f.format || "") ? 1280 : 1920), h: +f.height || 0,
              approx: !f.width, size: +f.size || 0
            }));
            const mp4 = vs.find(v => /mp4$/i.test(v.url));
            if (mp4) this.preview = mp4.url;
            return vs.slice(0, 12);
          }
        };
      });
    }
  },
  youtube: {
    name: "YouTube (Creative Commons)", types: ["video"], key: "youtube", watchOnly: true,
    desc: "Searches only videos their creators marked Creative Commons. Watch on YouTube; YouTube's terms don't allow downloading.",
    tokens: {},
    async search(q, type, page) {
      const tk = this.tokens[q] || (this.tokens[q] = {});
      if (page > 1 && !tk[page]) return [];
      const d = await getJSON("https://www.googleapis.com/youtube/v3/search?" + qs({ part: "snippet", type: "video", videoLicense: "creativeCommon", safeSearch: "strict", maxResults: 20, q, key: keys.youtube, pageToken: tk[page] }));
      if (d.nextPageToken) tk[page + 1] = d.nextPageToken;
      return (d.items || []).filter(v => v.id?.videoId).map(v => {
        const s = v.snippet, th = s.thumbnails?.high || s.thumbnails?.medium || s.thumbnails?.default || {};
        return {
          uid: "yt-" + v.id.videoId, source: "youtube", type: "video", title: strip(s.title), thumb: th.url, w: th.width, h: th.height,
          author: s.channelTitle, authorUrl: "https://www.youtube.com/channel/" + s.channelId,
          page: "https://www.youtube.com/watch?v=" + v.id.videoId, license: "CC BY (YouTube Creative Commons)",
          credit: `“${strip(s.title)}” by ${s.channelTitle} on YouTube, licensed CC BY`, watchOnly: true, variants: []
        };
      });
    }
  },
  unsplash: {
    name: "Unsplash", types: ["image"], key: "unsplash",
    async search(q, type, page) {
      const d = await getJSON("https://api.unsplash.com/search/photos?" + qs({ query: q, page, per_page: 20, content_filter: "high", client_id: keys.unsplash }));
      return d.results.map(p => {
        const u = p.urls, r = p.height / p.width, utm = "?utm_source=creator_downloader_mobile&utm_medium=referral";
        const sized = w => ({ label: w + " px", url: u.raw + "&w=" + w + "&q=85&fm=jpg", w, h: Math.round(w * r) });
        return {
          uid: "us-" + p.id, source: "unsplash", type: "image", title: p.alt_description || p.description || q, thumb: u.small, w: p.width, h: p.height,
          author: p.user?.name, authorUrl: p.user?.links?.html + utm, page: p.links.html + utm, license: "Unsplash License (free to use)",
          credit: `Photo by ${p.user?.name} on Unsplash`,
          variants: [sized(800), sized(1600), sized(2560), { label: "Original", url: u.full, w: p.width, h: p.height }],
          track() { import("./bridge.js").then(m => m.cd.ping(p.links.download_location + "&client_id=" + encodeURIComponent(keys.unsplash))); } // required by Unsplash API guidelines
        };
      });
    }
  }
};

export const DIRECTORY = [
  ["Openverse", "openverse.org", "Images", "No key", "CC / public domain (varies)", "in"],
  ["Wikimedia Commons", "commons.wikimedia.org", "Images, video", "No key", "CC / public domain (varies)", "in"],
  ["NASA Image and Video Library", "images.nasa.gov", "Images, video", "No key", "Public domain (generally)", "in"],
  ["Art Institute of Chicago", "artic.edu", "Images", "No key", "CC0", "in"],
  ["Cleveland Museum of Art", "clevelandart.org", "Images", "No key", "CC0", "in"],
  ["Pexels", "pexels.com/api", "Images, video", "Free key", "Pexels License", "key"],
  ["Pixabay", "pixabay.com/api/docs", "Images, video", "Free key", "Pixabay Content License", "key"],
  ["Unsplash", "unsplash.com/developers", "Images", "Free key", "Unsplash License", "key"],
  ["Internet Archive", "archive.org", "Video", "No key", "CC / public domain only", "in"],
  ["YouTube Creative Commons", "developers.google.com/youtube/v3", "Video (watch only)", "Free Google key", "CC BY", "key"],
  ["Pinterest", "pinterest.com", "Images", "Your own sign-in (tab)", "Mostly copyrighted", "in"],
  ["The Met Open Access", "metmuseum.github.io", "Images", "No key", "CC0", "next"],
  ["Smithsonian Open Access", "api.si.edu", "Images, 3D", "Free api.data.gov key", "CC0", "next"],
  ["Library of Congress", "loc.gov/apis", "Images, film", "No key", "Varies, much public domain", "next"],
  ["Europeana", "pro.europeana.eu", "Images, video", "Free key", "Varies (filterable)", "next"],
  ["Flickr Commons / CC", "flickr.com/services/api", "Images", "Free key", "CC / no known restrictions", "next"],
  ["Coverr", "coverr.co", "Video", "Free key on request", "Coverr License", "next"],
  ["Mixkit", "mixkit.co", "Video", "No public API", "Mixkit License", "link"],
  ["Videvo (free tier)", "videvo.net", "Video", "No public API", "Varies per clip", "link"],
  ["StockSnap", "stocksnap.io", "Images", "No public API", "CC0", "link"],
  ["Burst by Shopify", "burst.shopify.com", "Images", "No public API", "Burst license", "link"],
  ["Kaboompics", "kaboompics.com", "Images", "No public API", "Kaboompics license", "link"]
];

/* descriptions + where to get a key, shown in Settings */
export const META = {
  openverse: { desc: "800M+ openly licensed images gathered from Flickr, museums and more." },
  wikimedia: { desc: "The media library behind Wikipedia. Photos and videos, mostly Creative Commons." },
  nasa: { desc: "NASA photos and mission videos. Generally public domain." },
  artic: { desc: "Public-domain artworks from the Art Institute of Chicago." },
  cleveland: { desc: "CC0 artworks and photographs from the Cleveland Museum of Art." },
  pexels: { desc: "Popular free stock photos and videos.", keyUrl: "https://www.pexels.com/api/", keyHint: "Free key at pexels.com/api" },
  pixabay: { desc: "Free stock photos, illustrations and videos.", keyUrl: "https://pixabay.com/api/docs/", keyHint: "Key appears on pixabay.com/api/docs after logging in" },
  archive: { desc: SOURCES.archive.desc },
  youtube: { desc: SOURCES.youtube.desc, keyUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com", keyHint: "Enable YouTube Data API v3 in Google Cloud, then create an API key (free, about 100 searches a day)" },
  unsplash: { desc: "High-quality free photos.", keyUrl: "https://unsplash.com/developers", keyHint: "Create an app at unsplash.com/developers and copy its Access Key" }
};
/* sites without a usable public search API: open the same search there */
export const ELSEWHERE = [
  ["Pinterest", q => "https://www.pinterest.com/search/pins/?q=" + encodeURIComponent(q), "ideas, mostly copyrighted"],
  ["YouTube CC", q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&sp=EgIwAQ%253D%253D", "Creative Commons filter"],
  ["Google Images", q => "https://www.google.com/search?tbm=isch&tbs=sur:cl&q=" + encodeURIComponent(q), "Creative Commons filter"],
  ["Flickr", q => "https://www.flickr.com/search/?l=cc&text=" + encodeURIComponent(q), "Creative Commons filter"],
  ["Mixkit", q => "https://mixkit.co/free-stock-video/discover/" + encodeURIComponent(q.trim().replace(/\s+/g, "-")) + "/", "free videos"],
  ["StockSnap", q => "https://stocksnap.io/search/" + encodeURIComponent(q.trim().replace(/\s+/g, "+")), "CC0 photos"]
];

