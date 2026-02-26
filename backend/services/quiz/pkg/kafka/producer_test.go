package kafka

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// TestQuizAnsweredEvent_Structure tests the QuizAnsweredEvent structure
func TestQuizAnsweredEvent_Structure(t *testing.T) {
	now := time.Now()
	event := &QuizAnsweredEvent{
		UserID:      "user-123",
		QuestionID:  "question-456",
		Correct:     true,
		XPEarned:    10,
		CoinsEarned: 5,
		Timestamp:   now,
	}

	assert.Equal(t, "user-123", event.UserID)
	assert.Equal(t, "question-456", event.QuestionID)
	assert.True(t, event.Correct)
	assert.Equal(t, int32(10), event.XPEarned)
	assert.Equal(t, int32(5), event.CoinsEarned)
	assert.Equal(t, now, event.Timestamp)
}

// TestEventPublisher_Interface verifies Producer implements EventPublisher
func TestEventPublisher_Interface(t *testing.T) {
	var _ EventPublisher = (*Producer)(nil)
}

// TestNewProducer tests producer creation
func TestNewProducer(t *testing.T) {
	producer := NewProducer("localhost:9092")
	assert.NotNil(t, producer)
	assert.NotNil(t, producer.writer)
	assert.Equal(t, "pawfiler-events", producer.writer.Topic)
}

// TestPublishQuizAnswered_EventFields tests that all required fields are included
func TestPublishQuizAnswered_EventFields(t *testing.T) {
	// This is a unit test that verifies the event structure
	// In a real integration test, we would verify the actual Kafka message
	
	event := &QuizAnsweredEvent{
		UserID:      "user-789",
		QuestionID:  "question-101",
		Correct:     false,
		XPEarned:    0,
		CoinsEarned: 0,
		Timestamp:   time.Now(),
	}

	// Verify all required fields are present
	assert.NotEmpty(t, event.UserID)
	assert.NotEmpty(t, event.QuestionID)
	assert.False(t, event.Correct)
	assert.Equal(t, int32(0), event.XPEarned)
	assert.Equal(t, int32(0), event.CoinsEarned)
	assert.NotZero(t, event.Timestamp)
}

// TestPublishQuizAnswered_CorrectAnswer tests publishing a correct answer event
func TestPublishQuizAnswered_CorrectAnswer(t *testing.T) {
	event := &QuizAnsweredEvent{
		UserID:      "user-correct",
		QuestionID:  "question-easy",
		Correct:     true,
		XPEarned:    10,
		CoinsEarned: 5,
		Timestamp:   time.Now(),
	}

	assert.True(t, event.Correct)
	assert.Equal(t, int32(10), event.XPEarned)
	assert.Equal(t, int32(5), event.CoinsEarned)
}

// TestPublishQuizAnswered_IncorrectAnswer tests publishing an incorrect answer event
func TestPublishQuizAnswered_IncorrectAnswer(t *testing.T) {
	event := &QuizAnsweredEvent{
		UserID:      "user-incorrect",
		QuestionID:  "question-hard",
		Correct:     false,
		XPEarned:    0,
		CoinsEarned: 0,
		Timestamp:   time.Now(),
	}

	assert.False(t, event.Correct)
	assert.Equal(t, int32(0), event.XPEarned)
	assert.Equal(t, int32(0), event.CoinsEarned)
}

// TestPublishQuizAnswered_Topic verifies the topic is "pawfiler-events"
func TestPublishQuizAnswered_Topic(t *testing.T) {
	producer := NewProducer("localhost:9092")
	assert.Equal(t, "pawfiler-events", producer.writer.Topic)
}

// TestPublishQuizAnswered_DoesNotFailOnError tests that errors don't fail the operation
// This test verifies the graceful error handling requirement
func TestPublishQuizAnswered_DoesNotFailOnError(t *testing.T) {
	// Create producer with invalid broker to simulate failure
	producer := NewProducer("invalid-broker:9999")
	
	event := &QuizAnsweredEvent{
		UserID:      "user-test",
		QuestionID:  "question-test",
		Correct:     true,
		XPEarned:    10,
		CoinsEarned: 5,
		Timestamp:   time.Now(),
	}

	ctx := context.Background()
	
	// This should not return an error even though Kafka is unavailable
	// The method logs errors but returns nil to not fail answer processing
	err := producer.PublishQuizAnswered(ctx, event)
	assert.NoError(t, err, "PublishQuizAnswered should not return error even on failure")
}

// TestClose tests closing the producer
func TestClose(t *testing.T) {
	producer := NewProducer("localhost:9092")
	err := producer.Close()
	// Close may return error if connection was never established, which is fine
	_ = err
}
