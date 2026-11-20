import { useEffect, useMemo, useRef, useState } from "react";

const templates = import.meta.glob("./design/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const pages: Record<string, [string, string]> = {
  beranda: ["reksa_beranda", "reksa_beranda_desktop"],
  masuk: ["masuk_daftar_reksa", "masuk_daftar_reksa_desktop"],
  belajar: ["study_studio_fokus_blurting", "ruang_belajar_fokus_catat_desktop"],
  foto: ["kalibrasi_jol_pindai_esai", "qr_bridge_laptop_sambungkan_kamera_hp"],
  hasil: ["hasil_audit_ai_jadwal_ulang", "hasil_cek_catatan_jadwal_desktop"],
  guru: ["portal_guru_bukti_peta_kelas", "portal_guru_bukti_peta_kelas_desktop"],
  suara: ["teman_belajar_suara_feynman", "teman_belajar_suara_feynman_desktop"],
  campur: ["latihan_campur_topik_interleaving", "latihan_campur_topik_interleaving_desktop"],
  offline: ["mode_tanpa_internet_offline_pwa", "mode_tanpa_internet_offline_pwa_desktop"],
};
const reading =
  "TOGAF membantu menyelaraskan tujuan bisnis dengan teknologi. Arsitektur Bisnis memetakan tujuan dan proses organisasi. Arsitektur Data mengatur struktur dan aliran informasi. Arsitektur Aplikasi menjelaskan layanan dan hubungan antar aplikasi. Arsitektur Teknologi mencakup server, jaringan, dan infrastruktur. Siklus ADM terdiri dari Preliminary, Visi Arsitektur, Bisnis, Sistem Informasi, Teknologi, Peluang dan Solusi, Perencanaan Migrasi, Tata Kelola Implementasi, serta Manajemen Perubahan. Manajemen kebutuhan mendampingi seluruh siklus.";
const time = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export default function App() {
  const [page, setPage] = useState(() =>
    location.hash.slice(1) in pages ? location.hash.slice(1) : "beranda",
  );
  const [mobile, setMobile] = useState(innerWidth < 768);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<{ title: string; text: string } | null>(null);
  const [guess, setGuess] = useState(75);
  const [preview, setPreview] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const go = (p: string) => {
    setMenu(false);
    location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const hash = () =>
      setPage(location.hash.slice(1) in pages ? location.hash.slice(1) : "beranda");
    const resize = () => setMobile(innerWidth < 768);
    addEventListener("hashchange", hash);
    addEventListener("resize", resize);
    return () => {
      removeEventListener("hashchange", hash);
      removeEventListener("resize", resize);
    };
  }, []);
  const html = templates[`./design/${pages[page][mobile ? 0 : 1]}.html`];
  // Preserve the imported DOM and its interaction state on React-only updates.
  const markup = useMemo(() => ({ __html: html }), [html]);
  useEffect(() => {
    const el = root.current!;
    const q = (s: string) => el.querySelector<HTMLElement>(s);
    const all = (s: string) => Array.from(el.querySelectorAll<HTMLElement>(s));
    const text = (s: string, v: string) => {
      const n = q(s);
      if (n) n.textContent = v;
    };
    const show = (s: string, on: boolean) => {
      const n = q(s);
      if (n) n.hidden = !on;
    };
    const cleanups: (() => void)[] = [];
    const on = (s: string, fn: (e: Event) => void, type = "click") =>
      all(s).forEach((n) => {
        n.addEventListener(type, fn);
        cleanups.push(() => n.removeEventListener(type, fn));
      });
    let timer: ReturnType<typeof setInterval> | undefined;
    let seconds = 1500,
      minutes = 25,
      running = false,
      role = "student",
      register = false,
      recording = false,
      online = false,
      synced = false;
    let question = 0;
    const notice = (title: string, content: string) => setModal({ title, text: content });
    const speak = (content: string) => {
      if (!("speechSynthesis" in window)) {
        notice(
          "Suara belum tersedia",
          "Browser ini belum mendukung pembacaan suara. Kamu tetap bisa membaca teks di layar.",
        );
        return;
      }
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        return;
      }
      const u = new SpeechSynthesisUtterance(content);
      u.lang = "id-ID";
      u.onerror = () =>
        notice(
          "Suara belum tersedia",
          "Pilih suara Bahasa Indonesia di pengaturan perangkat atau baca ringkasannya di layar.",
        );
      speechSynthesis.speak(u);
    };
    if (localStorage.getItem("reksa-cookies")) show("#cookie-banner", false);
    on("#cookie-settings-toggle", () => {
      const n = q("#cookie-details");
      if (n) n.hidden = !n.hidden;
    });
    on("#cookie-essential-btn,#cookie-accept-btn,#cookie-close-x", (e) => {
      localStorage.setItem(
        "reksa-cookies",
        (e.currentTarget as HTMLElement).id === "cookie-accept-btn" ? "semua" : "penting",
      );
      show("#cookie-banner", false);
    });
    on("#menu-toggle-btn", () => {
      const n = q("#mobile-nav");
      if (n) n.hidden = !n.hidden;
    });
    on(".role-tab", (e) => {
      const target = e.currentTarget as HTMLElement;
      all(".role-tab").forEach((t) => {
        const active = t === target;
        t.setAttribute("aria-selected", String(active));
        t.tabIndex = 0;
        t.classList.toggle("bg-light-surface-container-lowest", active);
        show("#" + t.getAttribute("aria-controls"), active);
      });
    });
    const auth = () => {
      text(
        "#submit-label",
        `${register ? "Daftar & Mulai" : "Masuk ke"} ${role === "student" ? "Ruang Belajar" : "Portal Guru"}`,
      );
    };
    on("#tab-login,#tab-register", (e) => {
      register = (e.currentTarget as HTMLElement).id === "tab-register";
      show("#name-field", register);
      const name = q("#full-name") as HTMLInputElement;
      if (name) name.required = register;
      text("#auth-title", register ? "Buat Akun REKSA Gratis" : "Selamat Datang Kembali");
      all("#tab-login,#tab-register").forEach((n) =>
        n.setAttribute("aria-selected", String((n.id === "tab-register") === register)),
      );
      auth();
    });
    on(".role-btn", (e) => {
      role = (e.currentTarget as HTMLElement).dataset.role!;
      all(".role-btn").forEach((n) =>
        n.setAttribute("aria-checked", String(n === e.currentTarget)),
      );
      auth();
    });
    on("#toggle-pw-btn", () => {
      const n = q("#password") as HTMLInputElement;
      n.type = n.type === "password" ? "text" : "password";
      text("#pw-icon", n.type === "password" ? "visibility" : "visibility_off");
    });
    on(
      "#auth-form",
      (e) => {
        e.preventDefault();
        go(role === "student" ? "belajar" : "guru");
      },
      "submit",
    );
    on(".preset-btn", (e) => {
      if (running) return;
      minutes = Number((e.currentTarget as HTMLElement).dataset.minutes);
      seconds = minutes * 60;
      text("#timer-display", time(seconds));
      all(".preset-btn").forEach((n) =>
        n.setAttribute("aria-checked", String(n === e.currentTarget)),
      );
    });
    const reset = () => {
      clearInterval(timer);
      running = false;
      seconds = minutes * 60;
      text("#timer-display", time(seconds));
      show("#material-open-card", true);
      show("#material-locked-card", false);
      show("#preset-section", true);
      show("#idle-actions", true);
      show("#active-actions", false);
      show("#change-material-btn", true);
      text("#timer-status-text", "Siap Mulai Catat di Kertas");
    };
    if (page === "belajar") {
      const card = q("#material-open-card");
      if (card) {
        const p = document.createElement("p");
        p.className = "reading-copy";
        p.textContent = reading;
        card.appendChild(p);
      }
      on("#start-session-btn", () => {
        if (running) return;
        running = true;
        show("#material-open-card", false);
        show("#material-locked-card", true);
        show("#preset-section", false);
        show("#idle-actions", false);
        show("#active-actions", true);
        show("#change-material-btn", false);
        text("#timer-status-text", "Waktunya Menulis di Kertas!");
        text(
          "#timer-instruction",
          "Tuangkan semua yang kamu ingat di kertas. Tidak perlu sempurna, yang penting ide-idemu!",
        );
        const end = Date.now() + seconds * 1000;
        timer = setInterval(() => {
          seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
          text("#timer-display", time(seconds));
          if (!seconds) {
            clearInterval(timer);
            text("#timer-status-text", "Waktu fokus selesai. Hebat, kamu sudah berlatih!");
          }
        }, 1000);
      });
      on("#reset-session-btn", reset);
      on("#finish-blurting-btn", () => go("foto"));
      on("#change-material-btn", () =>
        notice(
          "Bahan bacaan contoh",
          "Prototipe ini menggunakan materi Arsitektur Enterprise — TOGAF. " + reading,
        ),
      );
    }
    const slider = q("#jol-slider") as HTMLInputElement;
    if (slider) {
      slider.value = String(guess);
      text("#jol-value", guess + "%");
      on(
        "#jol-slider",
        () => {
          setGuess(Number(slider.value));
          text("#jol-value", slider.value + "%");
          text(
            "#jol-label",
            Number(slider.value) < 40
              ? "Masih Ragu"
              : Number(slider.value) < 70
                ? "Lumayan Paham"
                : "Cukup Yakin",
          );
        },
        "input",
      );
    }
    on("#confirm-jol-btn", () => {
      show("#capture-locked-card", false);
      show("#capture-unlocked-card", true);
      slider.disabled = true;
      text("#confirm-jol-btn", "Tebakan tersimpan ✓");
    });
    on(
      "#camera-input,#gallery-input",
      (e) => {
        const f = (e.currentTarget as HTMLInputElement).files?.[0];
        if (f) {
          if (!f.type.startsWith("image/"))
            return notice("Pilih foto catatan", "Gunakan berkas gambar JPG, PNG, atau WebP.");
          setPreview(URL.createObjectURL(f));
          text("#upload-filename", f.name);
          show("#upload-preview", true);
          notice(
            "Foto siap dicek",
            "Foto catatanmu sudah dipilih. Tekan Kirim & Cek Catatan untuk melihat contoh hasil.",
          );
        }
      },
      "change",
    );
    on("#simulate-receive-btn", () => {
      show("#qr-waiting-card", false);
      show("#qr-received-card", true);
    });
    if (page === "hasil") {
      all("span,p,div")
        .filter((n) => n.children.length === 0)
        .forEach((n) => {
          if (n.textContent?.trim() === "75%") n.textContent = guess + "%";
          if (n.textContent?.trim() === "7%") n.textContent = Math.abs(guess - 68) + "%";
        });
      all("*")
        .filter((n) => n.children.length === 0)
        .forEach((n) => {
          if (n.textContent?.includes("23 Nov") || n.textContent?.includes("27 Nov")) {
            const offset = n.textContent.includes("23 Nov") ? 3 : 7;
            const d = new Date();
            d.setDate(d.getDate() + offset);
            n.textContent = `H+${offset} • ${d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`;
          }
        });
    }
    on("#tts-btn", () =>
      speak(
        `Ini contoh hasil cek catatan. Nilai hasilmu 68 persen. Tebakanmu ${guess} persen. ${q("#audit-summary-text")?.textContent || "Arsitektur Bisnis dan Data sudah bagus. Pelajari kembali tahapan ADM dan Arsitektur Teknologi."}`,
      ),
    );
    on("#speak-question-btn", () => speak(q("#ai-question-text")?.textContent || ""));
    const questions = [
      "Mengapa tujuan bisnis perlu dipahami sebelum membuat aplikasi?",
      "Apa bedanya Arsitektur Data dan Arsitektur Aplikasi?",
      "Bagaimana siklus TOGAF ADM membantu organisasi berubah?",
      "Bagaimana tata kelola memastikan implementasi sesuai rencana?",
    ];
    on("#next-question-btn", () => {
      question = (question + 1) % 4;
      text("#ai-question-text", questions[question]);
      all("*")
        .filter((n) => n.children.length === 0 && n.textContent?.includes("Pertanyaan 2 dari 4"))
        .forEach((n) => (n.textContent = `Pertanyaan ${question + 1} dari 4`));
    });
    on("#mic-toggle-btn", () => {
      recording = !recording;
      clearInterval(timer);
      text("#mic-icon", recording ? "stop" : "mic");
      text(
        "#mic-status",
        recording
          ? "Simulasi menjawab • Ketuk untuk selesai"
          : "Simulasi selesai • Coba jelaskan sekali lagi",
      );
      if (recording) {
        seconds = 0;
        timer = setInterval(() => text("#mic-timer", time(++seconds)), 1000);
      }
    });
    on("#shuffle-btn", () => {
      question = (question + 1) % 3;
      const topics = [
        "Keamanan & Tata Kelola Data",
        "Arsitektur Bisnis & Layanan Publik",
        "Arsitektur Teknologi & Cloud",
      ];
      text("#topic-b-title", topics[question]);
      text("#topic-b-desc", "Hubungkan kebutuhan organisasi dengan solusi teknologi yang tepat.");
      text(
        "#challenge-prompt",
        `Jelaskan bagaimana TOGAF ADM mendukung ${topics[question]} menggunakan contoh perusahaan ritel.`,
      );
    });
    on("#conn-toggle-btn,#sync-now-btn", (e) => {
      online = !online;
      if ((e.currentTarget as HTMLElement).id === "sync-now-btn") {
        online = true;
        synced = true;
      }
      text("#conn-icon", online ? "wifi" : "wifi_off");
      text("#conn-chip-text", online ? "Terhubung • Simulasi" : "Offline • Simulasi");
      text("#banner-title", online ? "Internet Terhubung Kembali!" : "Sinyal Tidak Tersedia");
      text(
        "#banner-desc",
        synced
          ? "Simulasi selesai. Kedua foto contoh berhasil dikirim."
          : "Mode demo: ubah status koneksi untuk mencoba antrean catatan.",
      );
      if (synced) {
        text("#queue-count", "0 Menunggu");
        all(".queue-badge").forEach((n) => (n.textContent = "Terkirim (demo)"));
        text("#sync-btn-text", "Semua Catatan Sudah Terkirim!");
      }
    });
    const links = (e: Event) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>("a,button");
      if (!target) return;
      const label = target.textContent?.trim() || "";
      const href = target.getAttribute("href") || "";
      if (target.tagName === "A") {
        e.preventDefault();
        if (href.startsWith("#") && q(href)) {
          q(href)?.scrollIntoView({ behavior: "smooth" });
          return;
        }
        const h = href.toLowerCase();
        if (h.includes("lupa")) {
          notice(
            "Lupa kata sandi?",
            "Ini akun demo tanpa autentikasi. Gunakan email dan kata sandi contoh yang sudah terisi untuk melanjutkan.",
          );
          return;
        }
        if (h.includes("masuk") || h.includes("auth")) return go("masuk");
        if (h.includes("hasil") || h.includes("audit")) return go("hasil");
        if (h.includes("qr") || h.includes("kalibrasi") || h.includes("jol-capture"))
          return go("foto");
        if (h.includes("guru")) return go("guru");
        if (h.includes("study") || h.includes("ruang-belajar")) return go("belajar");
        if (h.includes("landing") || h.includes("beranda")) return go("beranda");
      }
      if (/Mulai Belajar Gratis|Mulai Gratis|Buat Akun/.test(label)) go("masuk");
      else if (/Lihat Foto/.test(label))
        notice(
          "Bukti belajar • " +
            (target.closest("tr")?.querySelector("td")?.textContent?.trim() || "Catatan siswa"),
          "Data contoh: catatan siswa menjelaskan hubungan tujuan bisnis, aliran data, dan aplikasi. Fokus 24 menit 42 detik • Tebakan 75% • Skor contoh 68%. Bagian yang terlewat: TOGAF ADM dan infrastruktur server.",
        );
      else if (/Belajar Topik Lain|Mulai Latihan Campur|Buka Bacaan/.test(label)) go("belajar");
      else if (/Unggah dari Laptop/.test(label)) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          if (input.files?.[0]) {
            setPreview(URL.createObjectURL(input.files[0]));
            show("#qr-waiting-card", false);
            show("#qr-received-card", true);
          }
        };
        input.click();
      }
    };
    el.addEventListener("click", links);
    document.title = `REKSA — ${page === "beranda" ? "Teman Belajar Aktif" : page.charAt(0).toUpperCase() + page.slice(1)}`;
    return () => {
      cleanups.forEach((fn) => fn());
      el.removeEventListener("click", links);
      clearInterval(timer);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
    // Template bindings are rebuilt only when the page or responsive template changes.
  }, [page, mobile, html]);
  return (
    <>
      <div key={page + mobile} ref={root} className="page-enter" dangerouslySetInnerHTML={markup} />
      {page === "foto" && (
        <section className="demo-extra">
          <span className="eyebrow">LANGKAH 2 • KALIBRASI PEMAHAMAN</span>
          <h2>Tebakanmu sebelum melihat hasil</h2>
          <label htmlFor="desktop-guess">
            Seberapa yakin kamu? <b>{guess}%</b>
          </label>
          <input
            id="desktop-guess"
            type="range"
            min="0"
            max="100"
            value={guess}
            onChange={(e) => setGuess(Number(e.target.value))}
          />
          <div className="range-label">
            <span>Masih ragu</span>
            <span>Sangat yakin</span>
          </div>
          {preview && (
            <img src={preview} alt="Pratinjau foto catatan pilihanmu" className="note-preview" />
          )}
          <button className="primary" onClick={() => go("hasil")}>
            Kirim & Cek Catatan <span aria-hidden="true">→</span>
          </button>
          <p className="demo-note">
            Mode prototipe: QR, pengiriman foto, dan penilaian menggunakan simulasi.
          </p>
        </section>
      )}
      {page !== "beranda" && page !== "masuk" && (
        <p className="prototype-label">
          Prototipe interaktif • Data, nilai, rekaman suara, dan sinkronisasi adalah simulasi.
        </p>
      )}
      <div className="feature-menu">
        <button className="menu-trigger" onClick={() => setMenu(!menu)} aria-expanded={menu}>
          <span className="material-symbols-outlined">apps</span> Jelajahi REKSA{" "}
          <span className="material-symbols-outlined">{menu ? "expand_more" : "expand_less"}</span>
        </button>
        {menu && (
          <nav className="feature-panel" aria-label="Jelajahi halaman">
            <div className="eyebrow">RUANG BELAJAR AKTIF</div>
            {[
              ["beranda", "home", "Beranda"],
              ["belajar", "edit_note", "Ruang Belajar"],
              ["guru", "school", "Portal Guru"],
            ].map(([p, i, l]) => (
              <button key={p} onClick={() => go(p)}>
                <span className="material-symbols-outlined">{i}</span>
                {l}
              </button>
            ))}
            <div className="eyebrow">FITUR LANJUTAN · PASCA-MVP</div>
            {[
              ["suara", "record_voice_over", "Teman Belajar Suara"],
              ["campur", "shuffle", "Latihan Campur Topik"],
              ["offline", "wifi_off", "Mode Tanpa Internet"],
            ].map(([p, i, l]) => (
              <button key={p} onClick={() => go(p)}>
                <span className="material-symbols-outlined">{i}</span>
                {l}
              </button>
            ))}
          </nav>
        )}
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="eyebrow">REKSA • TEMAN BELAJARMU</span>
            <h2 id="modal-title">{modal.title}</h2>
            <p>{modal.text}</p>
            <button className="primary" autoFocus onClick={() => setModal(null)}>
              Oke, Mengerti
            </button>
          </section>
        </div>
      )}
    </>
  );
}
