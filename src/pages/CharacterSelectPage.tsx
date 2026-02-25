import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ModelViewer from "@/components/ModelViewer";
import { CHARACTER_CATALOG } from "@/lib/mockApi";
import type { CharacterModel } from "@/lib/types";

const rarityColors: Record<string, string> = {
  common: "hsl(var(--magic-green))",
  rare: "hsl(var(--magic-blue))",
  legendary: "hsl(var(--magic-orange))",
};

const rarityLabels: Record<string, string> = {
  common: "일반",
  rare: "희귀",
  legendary: "전설",
};

const CharacterSelectPage = () => {
  const [selected, setSelected] = useState<CharacterModel>(CHARACTER_CATALOG[0]);
  const navigate = useNavigate();

  const freeCharacters = CHARACTER_CATALOG.filter((c) => c.free);
  const premiumCharacters = CHARACTER_CATALOG.filter((c) => !c.free);

  const handleStart = () => {
    navigate("/login", { state: { characterModel: selected.id } });
  };

  return (
    <div className="flex flex-col lg:flex-row items-center justify-center gap-7 py-10 px-5 min-h-[80vh]">
      {/* Left: Character grid */}
      <div
        className="rounded-3xl p-7 shadow-lg max-w-md w-full max-h-[80vh] overflow-y-auto"
        style={{
          background: "hsl(var(--parchment))",
          border: "6px solid hsl(var(--parchment-border))",
          color: "hsl(var(--parchment-text))",
        }}
      >
        <h2
          className="font-jua text-3xl sticky top-0 pb-2 z-10"
          style={{ color: "hsl(var(--wood-darkest))", background: "hsl(var(--parchment))" }}
        >
          🐾 캐릭터 선택
        </h2>

        {/* Free characters */}
        <div className="font-jua text-lg" style={{ color: "hsl(var(--magic-green))" }}>
          ⭐ 무료 캐릭터
        </div>
        <div className="grid grid-cols-3 gap-3">
          {freeCharacters.map((char) => (
            <div
              key={char.id}
              className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105"
              style={{
                background: selected.id === char.id ? "hsl(var(--wood-base) / 0.2)" : "transparent",
                border: selected.id === char.id
                  ? `3px solid ${rarityColors[char.rarity]}`
                  : "3px solid transparent",
              }}
              onClick={() => setSelected(char)}
            >
              <span className="text-4xl">{char.emoji}</span>
              <span className="font-jua text-xs text-center">{char.name}</span>
            </div>
          ))}
        </div>

        {premiumCharacters.length > 0 && (
          <>
            <div className="font-jua text-lg mt-2" style={{ color: "hsl(var(--magic-orange))" }}>
              💎 상점 캐릭터
            </div>
            <div className="grid grid-cols-3 gap-3">
              {premiumCharacters.map((char) => (
                <div
                  key={char.id}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105"
                  style={{
                    background: selected.id === char.id ? "hsl(var(--wood-base) / 0.2)" : "transparent",
                    border: selected.id === char.id
                      ? `3px solid ${rarityColors[char.rarity]}`
                      : "3px solid transparent",
                  }}
                  onClick={() => setSelected(char)}
                >
                  <span className="text-4xl">{char.emoji}</span>
                  <span className="font-jua text-xs text-center">{char.name}</span>
                  {char.price > 0 && (
                    <span className="text-xs font-bold" style={{ color: rarityColors[char.rarity] }}>
                      🪙 {char.price}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right: 3D Preview */}
      <div
        className="rounded-3xl p-7 shadow-lg max-w-md w-full flex flex-col items-center gap-4"
        style={{
          background: "hsl(var(--wood-base))",
          border: "6px solid hsl(var(--wood-darkest))",
          color: "hsl(var(--foreground))",
        }}
      >
        <ModelViewer modelPath={selected.modelPath} height="320px" />

        <h3 className="font-jua text-3xl">
          {selected.emoji} {selected.name}
        </h3>

        <div className="flex items-center gap-2">
          <span
            className="font-jua text-sm px-3 py-1 rounded-full text-white"
            style={{ background: rarityColors[selected.rarity] }}
          >
            {rarityLabels[selected.rarity]}
          </span>
          {selected.price > 0 && (
            <span className="font-jua text-lg" style={{ color: "hsl(var(--magic-orange))" }}>
              🪙 {selected.price}
            </span>
          )}
          {selected.free && (
            <span className="font-jua text-lg" style={{ color: "hsl(var(--magic-green))" }}>
              무료!
            </span>
          )}
        </div>

        {selected.free ? (
          <button
            className="font-jua text-lg px-8 py-3 rounded-xl text-white transition-transform hover:scale-105"
            style={{ background: "hsl(var(--magic-green))" }}
            onClick={handleStart}
          >
            🎉 이 캐릭터로 시작하기
          </button>
        ) : (
          <button
            className="font-jua text-lg px-8 py-3 rounded-xl text-white transition-transform hover:scale-105"
            style={{ background: "hsl(var(--magic-orange))" }}
            onClick={() => navigate("/shop")}
          >
            🛒 상점에서 구매하기
          </button>
        )}
      </div>
    </div>
  );
};

export default CharacterSelectPage;
