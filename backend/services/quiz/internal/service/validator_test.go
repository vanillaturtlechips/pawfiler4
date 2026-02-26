package service

import (
	"testing"

	"quiz-service/internal/repository"
	"github.com/stretchr/testify/assert"
)

func TestValidateMultipleChoice(t *testing.T) {
	validator := NewAnswerValidator()

	tests := []struct {
		name          string
		selectedIndex int32
		correctIndex  int32
		optionsCount  int
		wantCorrect   bool
		wantError     bool
	}{
		{
			name:          "correct answer",
			selectedIndex: 2,
			correctIndex:  2,
			optionsCount:  4,
			wantCorrect:   true,
			wantError:     false,
		},
		{
			name:          "incorrect answer",
			selectedIndex: 1,
			correctIndex:  2,
			optionsCount:  4,
			wantCorrect:   false,
			wantError:     false,
		},
		{
			name:          "index out of range - negative",
			selectedIndex: -1,
			correctIndex:  2,
			optionsCount:  4,
			wantCorrect:   false,
			wantError:     true,
		},
		{
			name:          "index out of range - too high",
			selectedIndex: 4,
			correctIndex:  2,
			optionsCount:  4,
			wantCorrect:   false,
			wantError:     true,
		},
		{
			name:          "first option correct",
			selectedIndex: 0,
			correctIndex:  0,
			optionsCount:  3,
			wantCorrect:   true,
			wantError:     false,
		},
		{
			name:          "last option correct",
			selectedIndex: 3,
			correctIndex:  3,
			optionsCount:  4,
			wantCorrect:   true,
			wantError:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isCorrect, err := validator.ValidateMultipleChoice(tt.selectedIndex, tt.correctIndex, tt.optionsCount)

			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantCorrect, isCorrect)
			}
		})
	}
}

func TestValidateTrueFalse(t *testing.T) {
	validator := NewAnswerValidator()

	tests := []struct {
		name           string
		selectedAnswer bool
		correctAnswer  bool
		wantCorrect    bool
	}{
		{
			name:           "correct - true",
			selectedAnswer: true,
			correctAnswer:  true,
			wantCorrect:    true,
		},
		{
			name:           "correct - false",
			selectedAnswer: false,
			correctAnswer:  false,
			wantCorrect:    true,
		},
		{
			name:           "incorrect - selected true, correct false",
			selectedAnswer: true,
			correctAnswer:  false,
			wantCorrect:    false,
		},
		{
			name:           "incorrect - selected false, correct true",
			selectedAnswer: false,
			correctAnswer:  true,
			wantCorrect:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isCorrect := validator.ValidateTrueFalse(tt.selectedAnswer, tt.correctAnswer)
			assert.Equal(t, tt.wantCorrect, isCorrect)
		})
	}
}

func TestValidateRegionSelect(t *testing.T) {
	validator := NewAnswerValidator()

	tests := []struct {
		name           string
		selectedPoint  repository.Point
		correctRegions []repository.Region
		tolerance      int32
		wantCorrect    bool
	}{
		{
			name:          "exact center hit",
			selectedPoint: repository.Point{X: 100, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "within radius",
			selectedPoint: repository.Point{X: 130, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "within tolerance",
			selectedPoint: repository.Point{X: 155, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "outside tolerance",
			selectedPoint: repository.Point{X: 165, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: false,
		},
		{
			name:          "multiple regions - hit first",
			selectedPoint: repository.Point{X: 100, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
				{X: 300, Y: 300, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "multiple regions - hit second",
			selectedPoint: repository.Point{X: 300, Y: 300},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
				{X: 300, Y: 300, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "multiple regions - miss all",
			selectedPoint: repository.Point{X: 200, Y: 200},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
				{X: 300, Y: 300, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: false,
		},
		{
			name:          "diagonal distance within tolerance",
			selectedPoint: repository.Point{X: 135, Y: 135},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   10,
			wantCorrect: true,
		},
		{
			name:          "zero tolerance - within radius",
			selectedPoint: repository.Point{X: 130, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   0,
			wantCorrect: true,
		},
		{
			name:          "zero tolerance - outside radius",
			selectedPoint: repository.Point{X: 155, Y: 100},
			correctRegions: []repository.Region{
				{X: 100, Y: 100, Radius: 50},
			},
			tolerance:   0,
			wantCorrect: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isCorrect := validator.ValidateRegionSelect(tt.selectedPoint, tt.correctRegions, tt.tolerance)
			assert.Equal(t, tt.wantCorrect, isCorrect)
		})
	}
}

func TestValidateComparison(t *testing.T) {
	validator := NewAnswerValidator()

	tests := []struct {
		name         string
		selectedSide string
		correctSide  string
		wantCorrect  bool
		wantError    bool
	}{
		{
			name:         "correct - left",
			selectedSide: "left",
			correctSide:  "left",
			wantCorrect:  true,
			wantError:    false,
		},
		{
			name:         "correct - right",
			selectedSide: "right",
			correctSide:  "right",
			wantCorrect:  true,
			wantError:    false,
		},
		{
			name:         "incorrect - selected left, correct right",
			selectedSide: "left",
			correctSide:  "right",
			wantCorrect:  false,
			wantError:    false,
		},
		{
			name:         "incorrect - selected right, correct left",
			selectedSide: "right",
			correctSide:  "left",
			wantCorrect:  false,
			wantError:    false,
		},
		{
			name:         "invalid - empty string",
			selectedSide: "",
			correctSide:  "left",
			wantCorrect:  false,
			wantError:    true,
		},
		{
			name:         "invalid - uppercase",
			selectedSide: "LEFT",
			correctSide:  "left",
			wantCorrect:  false,
			wantError:    true,
		},
		{
			name:         "invalid - random string",
			selectedSide: "middle",
			correctSide:  "left",
			wantCorrect:  false,
			wantError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isCorrect, err := validator.ValidateComparison(tt.selectedSide, tt.correctSide)

			if tt.wantError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.wantCorrect, isCorrect)
			}
		})
	}
}
