import { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLanguage, useStrings } from '../i18n';
import { PALETTES, type MapTheme } from '../theme';
import { QUESTIONS, questionIn } from './questions';
import { answerQuestion, isRight, nextQuestion, solution, startQuiz, type Given, type Question } from './quiz';

const SIZE = 48; // as wide as the compass and the weather above it
// A right answer's tick and outline; a wrong one takes the current sites' red.
const RIGHT: Record<MapTheme, string> = { day: '#1b7f3b', night: '#7ee2a0' };

/** The quiz's progress, kept while its card is closed. */
export function useQuiz(questions: readonly Question[] = QUESTIONS) {
  const [state, setState] = useState(() => startQuiz(questions));
  const answer = useCallback((given: Given, asked?: Question) => setState((s) => answerQuestion(s, given, asked)), []);
  const next = useCallback(() => setState((s) => nextQuestion(s)), []);
  return { state, answer, next };
}

export type Quiz = ReturnType<typeof useQuiz>;

/** A round button under the weather; opens and closes the quiz. */
export function QuizButton({ open, theme, onPress }: { open: boolean; theme: MapTheme; onPress: () => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().quiz;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.title}
      accessibilityHint={open ? t.hide : t.ask}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      android_ripple={{ color: palette.border, borderless: true, radius: SIZE / 2 }}
      style={[styles.button, { backgroundColor: palette.surface, borderColor: palette.border }]}
    >
      <MaterialIcons name="quiz" size={24} color={open ? palette.accent : palette.muted} />
    </Pressable>
  );
}

/** What goes in the quiz card: the question on show, then whether the answer was right and a fact to go with it. */
export function QuizQuestion({ quiz, theme, onClose }: { quiz: Quiz; theme: MapTheme; onClose: () => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().quiz;
  const language = useLanguage();
  const { deck, index, given, right, asked } = quiz.state;
  const question = questionIn(deck[index], language);
  const correct = given !== null && isRight(question, given);
  const answer = (value: Given) => quiz.answer(value, question);

  return (
    <View style={styles.quiz}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: palette.text }]}>{t.title}</Text>
        {asked > 0 && <Text style={{ color: palette.muted }}>{t.score(right, asked)}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={t.close} hitSlop={8} onPress={onClose} style={styles.close}>
          <MaterialIcons name="close" size={22} color={palette.muted} />
        </Pressable>
      </View>

      <Text style={[styles.prompt, { color: palette.text }]}>{question.prompt}</Text>

      {question.kind === 'choice' ? (
        <Options question={question} given={given} theme={theme} onPick={answer} />
      ) : (
        // keyed by the count asked, so every blank starts empty, even the same one asked again
        <Blank key={`${question.id}-${asked}`} given={given} theme={theme} onCheck={answer} />
      )}

      {given !== null && (
        <>
          <View accessibilityLiveRegion="polite" style={styles.result}>
            <MaterialIcons name={correct ? 'check-circle' : 'cancel'} size={20} color={correct ? RIGHT[theme] : palette.status.current} />
            <Text style={[styles.resultText, { color: palette.text }]}>{correct ? t.right : t.answer(solution(question))}</Text>
          </View>
          <Text style={[styles.fact, { color: palette.muted }]}>{question.fact}</Text>
          <Pressable accessibilityRole="button" onPress={quiz.next} style={[styles.action, { backgroundColor: palette.text }]}>
            <Text style={[styles.actionText, { color: palette.surface }]}>{t.next}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function Options({ question, given, theme, onPick }: {
  question: Extract<Question, { kind: 'choice' }>;
  given: Given | null;
  theme: MapTheme;
  onPick: (option: number) => void;
}) {
  const palette = PALETTES[theme];
  const answered = given !== null;
  return (
    <View style={styles.options}>
      {question.options.map((option, i) => {
        // once answered, the right option is ticked, and a wrong pick crossed out
        const isAnswer = answered && i === question.answer;
        const wrongPick = given === i && !isAnswer;
        const mark = isAnswer ? RIGHT[theme] : wrongPick ? palette.status.current : null;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ disabled: answered, selected: given === i }}
            disabled={answered}
            onPress={() => onPick(i)}
            style={[styles.option, { backgroundColor: palette.border, borderColor: mark ?? palette.border }, mark !== null && styles.marked]}
          >
            <Text style={[styles.optionText, { color: palette.text }]}>{option}</Text>
            {isAnswer && <MaterialIcons name="check-circle" size={20} color={RIGHT[theme]} />}
            {wrongPick && <MaterialIcons name="cancel" size={20} color={palette.status.current} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function Blank({ given, theme, onCheck }: { given: Given | null; theme: MapTheme; onCheck: (typed: string) => void }) {
  const palette = PALETTES[theme];
  const t = useStrings().quiz;
  const [typed, setTyped] = useState('');
  const answered = given !== null;
  const empty = typed.trim() === '';
  const check = () => {
    if (empty) return;
    // out of the way of the result and its fact
    Keyboard.dismiss();
    onCheck(typed);
  };

  return (
    <View style={styles.blank}>
      <TextInput
        accessibilityLabel={t.yourAnswer}
        value={answered ? String(given) : typed}
        onChangeText={setTyped}
        editable={!answered}
        placeholder={t.yourAnswer}
        placeholderTextColor={palette.muted}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={check}
        style={[styles.input, { color: palette.text, borderColor: palette.muted }]}
      />
      {!answered && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: empty }}
          disabled={empty}
          onPress={check}
          style={[styles.action, { backgroundColor: palette.text }, empty && styles.disabled]}
        >
          <Text style={[styles.actionText, { color: palette.surface }]}>{t.check}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // round like the compass, under the weather's capsule
  button: { alignSelf: 'flex-end', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  quiz: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  close: { padding: 4 },
  prompt: { fontSize: 15, lineHeight: 21 },
  options: { gap: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  marked: { borderWidth: 2, paddingHorizontal: 11, paddingVertical: 9 },
  optionText: { flex: 1, fontSize: 15 },
  blank: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, minHeight: 44 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultText: { flex: 1, fontSize: 15, fontWeight: '600' },
  fact: { lineHeight: 20 },
  action: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', alignSelf: 'flex-start' },
  actionText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
});
