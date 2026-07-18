import os
import sys
import unittest
import textwrap

# Add scripts directory to path to import normalize_ai
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from normalize_ai import local_parse

class TestPDFParserEngine(unittest.TestCase):

    def test_vietaccepted_detail_parser(self):
        raw_text = textwrap.dedent("""\
        CHỨC NĂNG CHÍNH CÀI ĐẶT Trang chủ Khóa ôn đề
        Streak 09 - Reading - COE Textual 01 (Easy)
        RW Phase 1
        Daily Streak P1
        2018
        Lưu
        This is a beautiful passage about SAT preparation. Lewis Carroll wrote about it.
        (3) Explanation
        A. did the word (True)
        This is a correct answer explanation.
        B. the word
        Incorrect choice explanation.
        C. another word
        Incorrect choice explanation.
        D. final word
        Incorrect choice explanation.
        Nhập nội dung
        [vietacceptedsat]
        Mã đề: 1234
        Which choice completes the text?
        - - — —
        A. did the word
        B. the word
        C. another word
        D. final word
        satsuite.vietaccepted.edu.vn/report
        """)
        result = local_parse(raw_text, "Reading")
        
        self.assertIsNotNone(result)
        self.assertEqual(result["parser_name"], "vietaccepted_detail")
        self.assertEqual(result["correctAnswer"], "A")
        self.assertIn("Lewis Carroll", result["passage"])
        self.assertNotIn("CHỨC NĂNG CHÍNH", result["passage"])
        self.assertEqual(result["questionStem"], "Which choice completes the text?")
        self.assertEqual(len(result["choices"]), 4)
        self.assertEqual(result["choices"][0]["text"], "did the word")
        self.assertEqual(result["confidence"], 1.0) # 100% normalized to 1.0

    def test_abcd_parentheses_parser(self):
        raw_text = textwrap.dedent("""\
        This is a passage for testing parentheses layout.
        Which option fits best?
        (A) Option A text (B) Option B text (C) Option C text (D) Option D text
        Key: C
        """)
        result = local_parse(raw_text, "Writing")
        
        self.assertIsNotNone(result)
        self.assertEqual(result["parser_name"], "abcd_parentheses")
        self.assertEqual(result["correctAnswer"], "C")
        self.assertEqual(len(result["choices"]), 4)
        self.assertEqual(result["choices"][1]["text"], "Option B text")
        self.assertTrue(result["confidence"] >= 0.8)

    def test_generic_mcq_parser(self):
        raw_text = textwrap.dedent("""\
        Passage text goes here.
        What does this test?
        A. Choice A
        B. Choice B
        C. Choice C
        D. Choice D
        Đáp án: B
        """)
        result = local_parse(raw_text, "Reading")
        
        self.assertIsNotNone(result)
        self.assertEqual(result["parser_name"], "generic_mcq")
        self.assertEqual(result["correctAnswer"], "B")
        self.assertEqual(len(result["choices"]), 4)
        self.assertTrue(result["confidence"] >= 0.8)

    def test_generic_two_column_parser(self):
        raw_text = textwrap.dedent("""\
        Passage about two column layout.
        Which choice completes the text?
        A. Column A text        B. Column B text
        C. Column C text        D. Column D text
        Answer: D
        """)
        result = local_parse(raw_text, "Writing")
        
        self.assertIsNotNone(result)
        self.assertEqual(result["correctAnswer"], "D")
        self.assertEqual(len(result["choices"]), 4)
        self.assertEqual(result["choices"][1]["text"], "Column B text")

if __name__ == "__main__":
    unittest.main()
