import { useState } from 'react';
import { ApiError } from '@/core/apiClient';
import { useLoad } from '@/shared/hooks/useLoad';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Icon } from '@/shared/ui/Icon';
import {
  formatScore,
  institutionApi,
  INVITE_STATUS_LABEL,
  type EducatorInvite,
  type InstitutionEducator,
  type InstitutionOverview,
} from './institutionApi';

const CARD = 'flex flex-col gap-4 rounded-lg border border-line-soft bg-card p-5 sm:p-6';
const dateFormat = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

function RetryAlert({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-body-md text-on-danger-wash">
      {text}{' '}
      <button type="button" onClick={onRetry} className="min-h-11 text-teal underline underline-offset-2">
        Coba lagi
      </button>
    </p>
  );
}

/** Portal admin institusi (FR-10): pengajar, kode undangan, kelas, dan konsep tersulit. Tanpa data individu siswa. */
export function AdminPortal() {
  const overview = useLoad((signal) => institutionApi.overview(signal), []);

  if (overview.state.status === 'loading') return <p className="text-body-md text-ink-muted">Memuat institusi...</p>;
  if (overview.state.status === 'error') {
    const missing = overview.state.error instanceof ApiError && overview.state.error.status === 404;
    return missing ? (
      <p className="rounded-lg border border-line-soft bg-card px-5 py-4 text-body-md text-ink">
        Akun admin ini belum terhubung ke institusi. Hubungi tim REKSA.
      </p>
    ) : (
      <RetryAlert text="Data institusi gagal dimuat." onRetry={overview.reload} />
    );
  }

  const data = overview.state.data;
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-prose text-body-md text-ink-muted text-pretty">
        Kamu mengelola <strong className="font-semibold text-ink">{data.institution.name}</strong>. Di sini hanya ada angka gabungan per
        kelas dan per konsep. Foto, catatan, skor, dan nama siswa tidak pernah tampil, dan kelompok dengan kurang dari {data.minGroupSize}{' '}
        siswa tidak ditampilkan angkanya.
      </p>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <EducatorsCard data={data} onChanged={overview.reload} />
        <InvitesCard />
      </div>
      <ClassesCard data={data} />
      <ConceptsCard minGroupSize={data.minGroupSize} />
    </div>
  );
}

function EducatorsCard({ data, onChanged }: { data: InstitutionOverview; onChanged: () => void }) {
  const [target, setTarget] = useState<InstitutionEducator | null>(null);
  const [error, setError] = useState('');

  const detach = async () => {
    const educator = target;
    setTarget(null);
    if (!educator) return;
    setError('');
    try {
      await institutionApi.detachEducator(educator.id);
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404 ? 'Pengajar ini sudah tidak terhubung.' : 'Gagal melepas pengajar. Coba lagi.',
      );
      if (err instanceof ApiError && err.status === 404) onChanged();
    }
  };

  return (
    <section aria-labelledby="educators-title" className={CARD}>
      <h2 id="educators-title" className="font-title text-title-lg text-ink">
        Pengajar ({data.educators.length})
      </h2>
      {data.educators.length === 0 ? (
        <p className="text-body-md text-ink-muted">Belum ada pengajar. Buat kode undangan lalu bagikan ke guru di institusimu.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-soft">
          {data.educators.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 flex-col">
                <span className="text-body-lg text-ink">{e.fullName}</span>
                <span className="truncate text-body-sm text-ink-muted">
                  {e.email} · {e.classCount} kelas
                </span>
              </span>
              <Button variant="ghost" onClick={() => setTarget(e)} aria-label={`Lepas ${e.fullName} dari institusi`}>
                Lepas
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-body-md text-on-danger-wash">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={target !== null}
        icon="person_remove"
        title={`Lepas ${target?.fullName ?? ''}?`}
        confirmLabel="Ya, lepas"
        cancelLabel="Batal"
        onCancel={() => setTarget(null)}
        onConfirm={() => void detach()}
      >
        Kelasnya tetap milik pengajar ini, tapi tidak lagi tercatat di institusimu. Pengajar bisa bergabung lagi dengan kode undangan baru.
      </ConfirmDialog>
    </section>
  );
}

function InvitesCard() {
  const invites = useLoad((signal) => institutionApi.invites(signal), []);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setWorking(true);
    setError('');
    setCopied(false);
    try {
      const invite = await institutionApi.createInvite();
      setFresh(invite.code);
      invites.reload();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Batas 20 kode per jam tercapai. Coba lagi nanti.'
          : 'Kode gagal dibuat. Coba lagi.',
      );
    } finally {
      setWorking(false);
    }
  };

  const revoke = async (invite: EducatorInvite) => {
    setError('');
    try {
      await institutionApi.revokeInvite(invite.id);
      invites.reload();
    } catch {
      setError('Kode gagal dicabut. Coba lagi.');
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setError('Kode tidak bisa disalin otomatis. Salin manual dari layar.');
    }
  };

  return (
    <section aria-labelledby="invites-title" className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 id="invites-title" className="font-title text-title-lg text-ink">
          Kode undangan pengajar
        </h2>
        <p className="text-body-md text-ink-muted">
          Satu kode bisa dipakai beberapa guru selama 7 hari. Guru memasukkannya di halaman Akun mereka.
        </p>
      </div>
      <Button variant="primary" onClick={() => void create()} disabled={working} className="self-start">
        <Icon name="add_link" />
        {working ? 'Membuat...' : 'Buat kode baru'}
      </Button>
      {fresh && (
        <div role="status" className="flex flex-col gap-2 rounded-md bg-teal-wash px-4 py-3">
          <span className="text-body-sm text-ink">Simpan sekarang. Kode ini hanya tampil sekali.</span>
          <code className="font-mono text-mono-md break-all text-ink">{fresh}</code>
          <Button variant="outline" onClick={() => void copy()} className="self-start">
            <Icon name={copied ? 'check' : 'content_copy'} />
            {copied ? 'Tersalin' : 'Salin kode'}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-body-md text-on-danger-wash">
          {error}
        </p>
      )}
      {invites.state.status === 'error' && <RetryAlert text="Daftar kode gagal dimuat." onRetry={invites.reload} />}
      {invites.state.status === 'ready' && invites.state.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-soft">
          {invites.state.data.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="text-body-md text-ink">Dibuat {dateFormat.format(new Date(invite.createdAt))}</span>
                <span className="text-body-sm text-ink-muted">
                  {INVITE_STATUS_LABEL[invite.status]}
                  {invite.status === 'ACTIVE' && `, berlaku sampai ${dateFormat.format(new Date(invite.expiresAt))}`}
                </span>
              </span>
              {invite.status === 'ACTIVE' && (
                <Button variant="ghost" onClick={() => void revoke(invite)}>
                  Cabut
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClassesCard({ data }: { data: InstitutionOverview }) {
  return (
    <section aria-labelledby="inst-classes-title" className={CARD}>
      <h2 id="inst-classes-title" className="font-title text-title-lg text-ink">
        Kelas ({data.classes.length})
      </h2>
      {data.classes.length === 0 ? (
        <p className="text-body-md text-ink-muted">Kelas muncul di sini setelah pengajar yang terhubung membuat kelas baru.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[560px] text-left text-body-md">
            <thead>
              <tr className="border-b border-line-soft text-label-lg text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Kelas
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Pengajar
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Anggota
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Siswa dicek
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Sesi selesai
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Rata-rata skor
                </th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="py-3 pr-4 font-normal text-ink">
                    {c.name}
                  </th>
                  <td className="py-3 pr-4 text-ink-muted">{c.educator.fullName}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{c.memberCount}</td>
                  {c.suppressed ? (
                    <td colSpan={3} className="py-3 text-right text-body-sm text-ink-muted">
                      Kurang dari {data.minGroupSize} siswa dicek
                    </td>
                  ) : (
                    <>
                      <td className="py-3 pr-4 text-right tabular-nums">{c.auditedStudents}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{c.completedSessions}</td>
                      <td className="py-3 text-right tabular-nums">{formatScore(c.avgScore)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ConceptsCard({ minGroupSize }: { minGroupSize: number }) {
  const concepts = useLoad((signal) => institutionApi.concepts(signal), []);
  return (
    <section aria-labelledby="inst-concepts-title" className={CARD}>
      <div className="flex flex-col gap-1">
        <h2 id="inst-concepts-title" className="font-title text-title-lg text-ink">
          Konsep yang paling sering terlewat
        </h2>
        <p className="text-body-md text-ink-muted">
          Dari hasil cek terakhir setiap siswa, untuk materi kelas yang sudah dicek minimal {minGroupSize} siswa.
        </p>
      </div>
      {concepts.state.status === 'loading' && <p className="text-body-md text-ink-muted">Menghitung...</p>}
      {concepts.state.status === 'error' && <RetryAlert text="Data konsep gagal dimuat." onRetry={concepts.reload} />}
      {concepts.state.status === 'ready' &&
        (concepts.state.data.concepts.length === 0 ? (
          <p className="text-body-md text-ink-muted">Belum ada materi dengan cukup siswa untuk ditampilkan.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line-soft">
            {concepts.state.data.concepts.map((c) => (
              <li key={`${c.materialId}:${c.concept}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="flex flex-col">
                  <span className="text-body-lg text-ink">{c.concept}</span>
                  <span className="text-body-sm text-ink-muted">{c.materialTitle}</span>
                </span>
                <span className="font-mono text-mono-md text-ink-muted tabular-nums">
                  {c.studentsMissing} dari {c.studentsAudited} siswa ({c.percent}%)
                </span>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}
