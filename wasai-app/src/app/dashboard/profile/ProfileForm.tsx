"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileFormState } from "./actions";
import { GARMENT_TYPES, PREFECTURES, type CraftsmanProfile, type Profile } from "@/lib/types";

const initialState: ProfileFormState = {};

export default function ProfileForm({
  profile,
  craftsmanProfile,
}: {
  profile: Profile;
  craftsmanProfile: CraftsmanProfile | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

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
                <span className="text-ink-muted">未確認（証明書URLを登録すると運営が確認します）</span>
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
            <label htmlFor="certificate_url" className="block text-sm font-medium">
              資格証明書の画像/PDFのURL（任意）
            </label>
            <input
              id="certificate_url"
              name="certificate_url"
              type="url"
              defaultValue={craftsmanProfile?.certificate_url ?? ""}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-ink-muted">
              1〜3級の場合は都道府県職業能力開発協会が発行する技能検定合格証書、その他資格の場合は発行団体名が分かる証明書をご登録ください。
              運営が内容を確認できると、プロフィールに「確認済み」バッジが表示されます。資格級位または証明書URLを変更すると確認状態はリセットされます。
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
                    defaultChecked={craftsmanProfile?.specialties.includes(g)}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="portfolio_urls" className="block text-sm font-medium">
              実績写真URL（1行に1つ）
            </label>
            <textarea
              id="portfolio_urls"
              name="portfolio_urls"
              rows={4}
              defaultValue={craftsmanProfile?.portfolio_urls.join("\n") ?? ""}
              placeholder="https://..."
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_accepting_orders"
              defaultChecked={craftsmanProfile?.is_accepting_orders ?? true}
            />
            新規受注を受け付ける
          </label>
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
