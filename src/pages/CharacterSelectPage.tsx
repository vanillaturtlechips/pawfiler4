import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import WoodPanel from "@/components/WoodPanel";
import ParchmentPanel from "@/components/ParchmentPanel";
import GameButton from "@/components/GameButton";
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
    <motion.div
      className="flex h-full items-center justify-center gap-7 p-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Left: Character grid */}
      <ParchmentPanel className="flex flex-col gap-4 max-w-md w-full max-h-[80vh] overflow-y-auto scrollbar-none">
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
            <CharacterCard
              key={char.id}
              character={char}
              isSelected={selected.id === char.id}
              onClick={() => setSelected(char)}
            />
          ))}
        </div>

        {/* Premium characters */}
        <div className="font-jua text-lg mt-2" style={{ color: "hsl(var(--magic-orange))" }}>
          💎 상점 캐릭터
        </div>
        <div className="grid grid-cols-3 gap-3">
          {premiumCharacters.map((char) => (
            <CharacterCard
              key={char.id}
              character={char}
              isSelected={selected.id === char.id}
              onClick={() => setSelected(char)}
            />
          ))}
        </div>
      </ParchmentPanel>

      {/* Right: 3D Preview */}
      <WoodPanel className="flex flex-col items-center max-w-md w-full py-6 gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-full"
          >
            <ModelViewer modelPath={selected.modelPath} height="320px" />
          </motion.div>
        </AnimatePresence>

        <motion.h3
          className="font-jua text-3xl text-shadow-deep"
          key={selected.name}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          {selected.emoji} {selected.name}
        </motion.h3>

        <div className="flex items-center gap-2">
          <span
            className="font-jua text-sm px-3 py-1 rounded-full"
            style={{
              background: rarityColors[selected.rarity],
              color: "white",
            }}
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
          <GameButton variant="green" onClick={handleStart}>
            🎉 이 캐릭터로 시작하기
          </GameButton>
        ) : (
          <GameButton variant="orange" onClick={() => navigate("/shop")}>
            🛒 상점에서 구매하기
          </GameButton>
        )}
      </WoodPanel>
    </motion.div>
  );
};

// --- Character Card Component ---
const CharacterCard = ({
  character,
  isSelected,
  onClick,
}: {
  character: CharacterModel;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <motion.div
    className="flex flex-col items-center gap-1 p-3 rounded-xl cursor-pointer"
    style={{
      background: isSelected ? "hsl(var(--wood-base) / 0.2)" : "transparent",
      border: isSelected
        ? `3px solid ${rarityColors[character.rarity]}`
        : "3px solid transparent",
    }}
    whileHover={{ scale: 1.08, y: -3 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
  >
    <span className="text-4xl">{character.emoji}</span>
    <span
      className="font-jua text-xs text-center"
      style={{ color: "hsl(var(--parchment-text))" }}
    >
      {character.name}
    </span>
    {character.price > 0 && (
      <span
        className="text-xs font-bold"
        style={{ color: rarityColors[character.rarity] }}
      >
        🪙 {character.price}
      </span>
    )}
  </motion.div>
);

export default CharacterSelectPage;
