package kafka

import (
	"context"
	"encoding/json"
	"log"

	"github.com/segmentio/kafka-go"
)

type Producer struct {
	writer *kafka.Writer
}

func NewProducer(brokers string) *Producer {
	return &Producer{
		writer: &kafka.Writer{
			Addr:     kafka.TCP(brokers),
			Topic:    "pawfiler-events",
			Balancer: &kafka.LeastBytes{},
		},
	}
}

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

func (p *Producer) Close() error {
	return p.writer.Close()
}
