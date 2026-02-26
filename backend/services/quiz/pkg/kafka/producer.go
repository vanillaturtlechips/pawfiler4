package kafka

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

// EventPublisher defines the interface for publishing quiz events
type EventPublisher interface {
	PublishQuizAnswered(ctx context.Context, event *QuizAnsweredEvent) error
	Close() error
}

// QuizAnsweredEvent represents a quiz answer event
type QuizAnsweredEvent struct {
	UserID      string    `json:"user_id"`
	QuestionID  string    `json:"question_id"`
	Correct     bool      `json:"correct"`
	XPEarned    int32     `json:"xp_earned"`
	CoinsEarned int32     `json:"coins_earned"`
	Timestamp   time.Time `json:"timestamp"`
}

// Producer implements EventPublisher interface
type Producer struct {
	writer *kafka.Writer
}

// NewProducer creates a new Kafka producer
func NewProducer(brokers string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers),
			Topic:    "pawfiler-events",
			Balancer: &kafka.LeastBytes{},
		},
	}
}

// PublishQuizAnswered publishes a quiz answered event to Kafka
// Implements retry logic with exponential backoff (max 3 attempts)
// Errors are logged but do not fail the operation
func (p *Producer) PublishQuizAnswered(ctx context.Context, event *QuizAnsweredEvent) error {
	message := map[string]interface{}{
		"event_type": "quiz.answered",
		"payload": map[string]interface{}{
			"user_id":       event.UserID,
			"question_id":   event.QuestionID,
			"correct":       event.Correct,
			"xp_earned":     event.XPEarned,
			"coins_earned":  event.CoinsEarned,
			"timestamp":     event.Timestamp,
		},
	}

	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Failed to marshal quiz answered event: %v", err)
		return nil // Don't fail answer processing
	}

	// Retry logic: max 3 attempts with exponential backoff
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		err = p.writer.WriteMessages(ctx, kafka.Message{
			Value: data,
		})

		if err == nil {
			log.Printf("Quiz answered event published successfully: user_id=%s, question_id=%s, correct=%v",
				event.UserID, event.QuestionID, event.Correct)
			return nil
		}

		// Log the error
		log.Printf("Failed to publish quiz answered event (attempt %d/%d): %v",
			attempt, maxRetries, err)

		// If not the last attempt, wait with exponential backoff
		if attempt < maxRetries {
			backoffDuration := time.Duration(1<<uint(attempt-1)) * time.Second // 1s, 2s, 4s
			log.Printf("Retrying in %v...", backoffDuration)
			time.Sleep(backoffDuration)
		}
	}

	// After all retries failed, log but don't return error
	log.Printf("Failed to publish quiz answered event after %d attempts, continuing anyway", maxRetries)
	return nil
}

// Emit is kept for backward compatibility with existing code
func (p *Producer) Emit(eventType string, payload map[string]interface{}) error {
	message := map[string]interface{}{
		"event_type": eventType,
		"payload":    payload,
	}

	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	err = p.writer.WriteMessages(context.Background(), kafka.Message{
		Value: data,
	})

	if err != nil {
		log.Printf("Failed to emit event: %v", err)
		return err
	}

	log.Printf("Event emitted: %s", eventType)
	return nil
}

// Close closes the Kafka writer
func (p *Producer) Close() error {
	return p.writer.Close()
}
