from confluent_kafka import Producer
import json
import logging
import os

logger = logging.getLogger(__name__)


class KafkaEventProducer:
    def __init__(self, brokers: str = None):
        brokers = brokers or os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:29092")
        self.producer = Producer({"bootstrap.servers": brokers})
    
    def emit(self, event_type: str, payload: dict):
        """이벤트 발행"""
        try:
            message = json.dumps({
                "event_type": event_type,
                "payload": payload
            })
            self.producer.produce(
                topic="pawfiler-events",
                value=message.encode("utf-8"),
                callback=self._delivery_callback
            )
            self.producer.flush()
        except Exception as e:
            logger.error(f"Failed to emit event: {e}")
    
    def _delivery_callback(self, err, msg):
        if err:
            logger.error(f"Message delivery failed: {err}")
        else:
            logger.info(f"Message delivered to {msg.topic()}")
