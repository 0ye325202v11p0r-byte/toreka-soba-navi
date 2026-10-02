"use client";

import { useActionState, useState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";
import { GARMENT_TYPES, PREFECTURES, type CraftsmanProfile, type CraftsmanRate, type Profile } from "@/lib/types";
import Avatar from "@/components/Avatar";
import AvatarUploader from "./AvatarUploader";
import PortfolioUploader from "./PortfolioUploader";
import CertificateUploader from "./CertificateUploader";
import ImageUploadButton from "@/components/ImageUploadButton";
import { uploadCover, removeCover } from "./uploadActions";

const initialState: ProfileFormState = {};

export default function ProfileForm({
  profile,
  craftsmanProfile,
  rates,
  certificateSignedUrl,
}: {
  profile: Profile;
  craftsmanProfile: CraftsmanProfile | null;
  rates: CraftsmanRate[];
  certificateSignedUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [specialties, setSpecialties] = useState<string[]>(craftsmanProfile?.specialties ?? []);
  const ratesByGarment = new Map(rates.map((r) => [r.garment_type, r.price]));

  const toggleSpecialty = (g: string) => {
    setSpecialties((prev) => (prev.includes(g) ? prev.filter((s) => s !== g) : [...prev, g]));
  };

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="role" value={profile.role} />

      <div>
        <label htmlFor="display_name" className="block text-sm font-medium">
          表示名
        </label>
        <input
          id="display_name"
          name="display_name"
          defaultValue={profile.display_name}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="avatar_url" className="block text-sm font-medium">
          プロフィール画像URL（任意）
        </label>
        <div className="mt-1 flex items-center gap-3">
          <Avatar url={profile.avatar_url} name={profile.display_name} size={48} />
          <input
            key={profile.avatar_url ?? "no-avatar"}
            id="avatar_url"
            name="avatar_url"
            type="url"
            defaultValue={profile.avatar_url ?? ""}
            placeholder="https://..."
            className="min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-1">
          <AvatarUploader />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          画像をアップロードするか、外部に置いた画像のURLを直接貼り付けてください。未設定の場合は表示名の頭文字が表示されます。
        </p>
      </div>

      <div>
        <label htmlFor="prefecture" className="block text-sm font-medium">
          都道府県
        </label>
        <select
          id="prefecture"
          name="prefecture"
          defaultValue={profile.prefecture ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        >
          <option value="">選択しない</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium">
          自己紹介
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={profile.bio ?? ""}
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      {profile.role === "craftsman" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h2 className="text-sm font-semibold">和裁士情報</h2>

          <div>
            <p className="text-sm font-medium">トップ画像</p>
            <p className="mt-1 text-xs text-ink-muted">
              あなたのページのいちばん上に、横長で大きく表示されます。工房の様子や、仕立てた着物の写真などがおすすめです（横長の写真がきれいに収まります）。
            </p>
            {profile.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage public URL, no Next Image domain config
              <img src={profile.cover_url} alt="トップ画像" className="mt-2 aspect-[3/1] w-full rounded-md object-cover" />
            )}
            <div className="mt-2">
              <ImageUploadButton upload={uploadCover} remove={removeCover} hasImage={Boolean(profile.cover_url)} label="トップ画像" />
            </div>
          </div>

          <div>
            <label htmlFor="grade" className="block text-sm font-medium">
              資格級位（和裁技能士）
            </label>
            <select
              id="grade"
              name="grade"
              defaultValue={craftsmanProfile?.grade ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            >
              <option value="">未設定</option>
              <option value="1級">1級</option>
              <option value="2級">2級</option>
              <option value="3級">3級</option>
              <option value="その他資格">その他資格</option>
              <option value="資格なし">資格なし</option>
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              1〜3級は国家検定「和裁技能士」（厚生労働省・都道府県職業能力開発協会）の等級です。
              日本和裁士会認定などそれ以外の資格をお持ちの場合は「その他資格」を選び、発行団体名が分かる証明書を登録してください。
            </p>
          </div>

          {craftsmanProfile?.grade && (
            <p className="text-xs">
              {craftsmanProfile.grade_verified ? (
                <span className="text-good">✓ 運営による資格確認済み</span>
              ) : (
                <span className="text-ink-muted">未確認（証明書をアップロードすると運営が確認します）</span>
              )}
            </p>
          )}

          <div>
            <label htmlFor="years_experience" className="block text-sm font-medium">
              経験年数
            </label>
            <input
              id="years_experience"
              name="years_experience"
              type="number"
              min={0}
              defaultValue={craftsmanProfile?.years_experience ?? ""}
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium">資格証明書（画像/PDF、任意）</label>
            <div className="mt-1">
              <CertificateUploader signedUrl={certificateSignedUrl} />
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              1〜3級の場合は都道府県職業能力開発協会が発行する技能検定合格証書、その他資格の場合は発行団体名が分かる証明書をアップロードしてください。
              非公開で保存され、本人と運営のみが閲覧できます。運営が内容を確認できると、プロフィールに「確認済み」バッジが表示されます。資格級位を変更するか証明書を差し替えると確認状態はリセットされます。
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">得意分野</legend>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {GARMENT_TYPES.map((g) => (
                <label key={g} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="specialties"
                    value={g}
                    checked={specialties.includes(g)}
                    onChange={() => toggleSpecialty(g)}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>

          {specialties.length > 0 && (
            <div>
              <p className="text-sm font-medium">得意分野ごとの目安料金（任意）</p>
              <p className="mt-1 text-xs text-ink-muted">
                依頼者が予算に合う和裁士を探しやすくなります。「仕立てメニュー」ほど作り込まなくても、大まかな相場感だけ伝えられます。
              </p>
              <div className="mt-2 space-y-2">
                {specialties.map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <label htmlFor={`rate_${g}`} className="w-24 shrink-0 text-sm">
                      {g}
                    </label>
                    <input
                      id={`rate_${g}`}
                      name={`rate_${g}`}
                      type="number"
                      min={0}
                      placeholder="円"
                      defaultValue={ratesByGarment.get(g) ?? ""}
                      className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="portfolio_urls" className="block text-sm font-medium">
              実績写真URL（1行に1つ）
            </label>
            <textarea
              key={craftsmanProfile?.portfolio_urls.join(",") ?? "no-portfolio"}
              id="portfolio_urls"
              name="portfolio_urls"
              rows={4}
              defaultValue={craftsmanProfile?.portfolio_urls.join("\n") ?? ""}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-ink-muted">
              アップロードした写真もこの欄にURLとして追加されます。不要な行を消せば削除できます（削除の反映には「保存する」を押してください）。
            </p>
            <PortfolioUploader />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_accepting_orders"
              defaultChecked={craftsmanProfile?.is_accepting_orders ?? true}
            />
            新規受注を受け付ける
          </label>

          <div>
            <label htmlFor="max_concurrent_orders" className="block text-sm font-medium">
              同時受注の上限（任意）
            </label>
            <input
              id="max_concurrent_orders"
              name="max_concurrent_orders"
              type="number"
              min={1}
              defaultValue={craftsmanProfile?.max_concurrent_orders ?? ""}
              placeholder="未設定＝上限なし"
              className="mt-1 w-32 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-ink-muted">
              進行中の取引がこの件数に達すると、新規受注（提案の送信・提案の承諾・仕立てメニューへの直接の申込み）が自動的に止まります。
            </p>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-md bg-good-soft px-3 py-2 text-sm text-good">
          保存しました。
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "保存中…" : "保存する"}
      </button>
    </form>
  );
}
