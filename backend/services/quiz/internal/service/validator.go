package service

import (
	"fmt"
	"math"

	"github.com/pawfiler/backend/services/quiz/internal/repository"
)

// AnswerValidator defines the interface for validating quiz answers
// Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4
type AnswerValidator interface {
	// ValidateMultipleChoice validates a multiple choice answer
	// Requirements: 5.1, 5.2, 5.3, 5.4
	ValidateMultipleChoice(selectedIndex int32, correctIndex int32, optionsCount int) (bool, error)

	// ValidateTrueFalse validates a true/false answer
	// Requirements: 6.1, 6.2, 6.3
	ValidateTrueFalse(selectedAnswer bool, correctAnswer bool) bool

	// ValidateRegionSelect validates a region select answer using Euclidean distance
	// Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
	ValidateRegionSelect(selectedPoint repository.Point, correctRegions []repository.Region, tolerance int32) bool

	// ValidateComparison validates a comparison answer
	// Requirements: 8.1, 8.2, 8.3, 8.4
	ValidateComparison(selectedSide string, correctSide string) (bool, error)
}

// DefaultAnswerValidator is the default implementation of AnswerValidator
type DefaultAnswerValidator struct{}

// NewAnswerValidator creates a new instance of the default answer validator
func NewAnswerValidator() AnswerValidator {
	return &DefaultAnswerValidator{}
}

// ValidateMultipleChoice validates a multiple choice answer
// Requirements:
// - 5.1: Validate selected_index
// - 5.2: Return true if selected_index matches correct_index
// - 5.3: Return false if selected_index does not match correct_index
// - 5.4: Return INVALID_ARGUMENT error if selected_index is out of range
func (v *DefaultAnswerValidator) ValidateMultipleChoice(selectedIndex int32, correctIndex int32, optionsCount int) (bool, error) {
	// Requirement 5.4: Validate index is within range
	if selectedIndex < 0 || selectedIndex >= int32(optionsCount) {
		return false, fmt.Errorf("selected_index %d is out of range [0, %d)", selectedIndex, optionsCount)
	}

	// Requirements 5.2, 5.3: Check if selected index matches correct index
	return selectedIndex == correctIndex, nil
}

// ValidateTrueFalse validates a true/false answer
// Requirements:
// - 6.1: Validate selected_answer
// - 6.2: Return true if selected_answer matches correct_answer
// - 6.3: Return false if selected_answer does not match correct_answer
func (v *DefaultAnswerValidator) ValidateTrueFalse(selectedAnswer bool, correctAnswer bool) bool {
	// Requirements 6.2, 6.3: Check if selected answer matches correct answer
	return selectedAnswer == correctAnswer
}

// ValidateRegionSelect validates a region select answer using Euclidean distance
// Requirements:
// - 7.1: Validate selected_region (Point)
// - 7.2: Calculate distance between selected_region and each correct_region center
// - 7.3: Return true if distance <= (correct_region.radius + tolerance)
// - 7.4: Return false if all distances > (correct_region.radius + tolerance)
// - 7.5: Use Euclidean distance formula
func (v *DefaultAnswerValidator) ValidateRegionSelect(selectedPoint repository.Point, correctRegions []repository.Region, tolerance int32) bool {
	// Requirement 7.2: Check each correct region
	for _, region := range correctRegions {
		// Requirement 7.5: Calculate Euclidean distance
		// distance = sqrt((x2 - x1)^2 + (y2 - y1)^2)
		dx := float64(selectedPoint.X - region.X)
		dy := float64(selectedPoint.Y - region.Y)
		distance := math.Sqrt(dx*dx + dy*dy)

		// Requirement 7.3: Check if within tolerance
		threshold := float64(region.Radius + tolerance)
		if distance <= threshold {
			return true
		}
	}

	// Requirement 7.4: No region matched
	return false
}

// ValidateComparison validates a comparison answer
// Requirements:
// - 8.1: Validate selected_side
// - 8.2: Return true if selected_side matches correct_side
// - 8.3: Return false if selected_side does not match correct_side
// - 8.4: Return INVALID_ARGUMENT error if selected_side is not "left" or "right"
func (v *DefaultAnswerValidator) ValidateComparison(selectedSide string, correctSide string) (bool, error) {
	// Requirement 8.4: Validate selected_side is "left" or "right"
	if selectedSide != "left" && selectedSide != "right" {
		return false, fmt.Errorf("selected_side must be 'left' or 'right', got '%s'", selectedSide)
	}

	// Requirements 8.2, 8.3: Check if selected side matches correct side
	return selectedSide == correctSide, nil
}
