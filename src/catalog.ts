export const catalog = [
  {
    id: "jade",
    kind: "skin",
    name: "ทหารหยก",
    price: 0,
    icon: "♟",
    color: "#72a48b",
    desc: "สหายตัวจิ๋วประจำกองทัพ",
  },
  {
    id: "azure",
    kind: "skin",
    name: "อัศวินฟ้าคราม",
    price: 120,
    icon: "♟",
    color: "#75aaca",
    desc: "เครื่องแบบสีฟ้าของหน่วยลาดตระเวน",
  },
  {
    id: "rose",
    kind: "skin",
    name: "องครักษ์กุหลาบ",
    price: 120,
    icon: "♟",
    color: "#cf8d9c",
    desc: "กองทัพสีชมพูพร้อมออกเดินทาง",
  },
  {
    id: "forest",
    kind: "board",
    name: "ป่าสีคราม",
    price: 0,
    icon: "▦",
    color: "#6e8876",
    desc: "กระดานไม้แห่งลานฝึก",
  },
  {
    id: "sunset",
    kind: "board",
    name: "แสงยามเย็น",
    price: 180,
    icon: "▦",
    color: "#c38d6c",
    desc: "ตกแต่งครึ่งกระดานฝั่งคุณ",
  },
  {
    id: "spark",
    kind: "effect",
    name: "ประกายดาว",
    price: 0,
    icon: "✦",
    color: "#e8c178",
    desc: "ประกายสีทองเมื่อกินหมาก",
  },
  {
    id: "bloom",
    kind: "effect",
    name: "ปุยดอกไม้",
    price: 100,
    icon: "✿",
    color: "#e3a4ba",
    desc: "ปุยสีชมพูเมื่อกินหมาก",
  },
] as const;
export type Profile = {
  coins: number;
  owned: string[];
  skin: string;
  board: string;
  effect: string;
  completed: number[];
};
export const freshProfile = (): Profile => ({
  coins: 0,
  owned: ["jade", "forest", "spark"],
  skin: "jade",
  board: "forest",
  effect: "spark",
  completed: [],
});
