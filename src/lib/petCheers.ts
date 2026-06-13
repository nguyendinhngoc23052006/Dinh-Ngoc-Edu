// The optimistic one-liners the on-screen pet throws out while you study.
// Vietnamese, to match the app's audience. Pure data + a picker — no Supabase,
// no React — so it's trivially testable.

export const PET_CHEERS = [
  'Cố lên, bạn làm được mà! 🌟',
  'Mỗi câu trả lời là một bước tiến nhỏ.',
  'Tớ tin ở cậu, học tiếp nào!',
  'Nghỉ một chút cũng không sao đâu nhé.',
  'Cậu giỏi hơn cậu nghĩ đấy!',
  'Sai cũng được — đó là cách mình học mà.',
  'Một chút nữa thôi, sắp xong rồi!',
  'Hôm nay cậu đã chăm chỉ lắm rồi.',
  'Hít thở sâu nào, rồi mình làm tiếp.',
  'Tớ tự hào về cậu! 🎉',
]

// Pick a random cheer, optionally avoiding the one just shown so the same line
// doesn't repeat back-to-back.
export function pickCheer(exclude?: string): string {
  const pool = exclude
    ? PET_CHEERS.filter((cheer) => cheer !== exclude)
    : PET_CHEERS
  const choices = pool.length > 0 ? pool : PET_CHEERS
  return choices[Math.floor(Math.random() * choices.length)] as string
}
